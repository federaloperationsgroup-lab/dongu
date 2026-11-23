package app.dongu.store;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Döngü mağaza eklentisi (v10.20): Google Play Faturalandırma'ya doğrudan bağlanır; aracı hizmet yoktur.
 *
 * Oyun (app.js) dört şey ister:
 *   getProducts({ ids })       → { products: [{ id, price, micros, currency, title }] }   mağazadaki fiyatlar
 *   purchase({ id, account })  → { purchases: [{ id, token, state, orderId, time }] }     ödeme penceresi; state: purchased | pending
 *   pending()                  → { purchases: [...] }                                     tüketilmemiş satın almalar (yarıda kalan / onay bekleyen)
 *   finish({ token })          → {}                                                       sunucu hesaba işledikten sonra tüket (ürün yeniden alınabilir)
 * Olay: "purchases" — ödeme penceresi dışında gelen satın alma (bekleyen ödemenin onaylanması).
 *
 * Altını bu eklenti vermez: satın alma belirteci sunucuya gider, sunucu Google Play'e sorup hesaba işler.
 * Hata kodları: cancelled, owned, unavailable, billing_unavailable, network, busy, bad_args, store_N, store_error.
 * Dayanıklılık: Faturalandırma kurulamazsa uygulama yine açılır (mağaza kapalı kalır); beklenmeyen hata çağrıyı yanıtsız bırakmaz.
 */
@CapacitorPlugin(name = "DonguStore")
public class DonguStorePlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient client;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private final List<Runnable> waiting = new ArrayList<>();
    private final List<PluginCall> waitingCalls = new ArrayList<>();
    private boolean connecting = false;
    private PluginCall buyCall;

    @Override
    public void load() {
        try {
            client = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
        } catch (Throwable t) {
            client = null; // Faturalandırma kurulamadı (ör. Google Play'siz cihaz): uygulama yine açılır, mağaza kapalı kalır
        }
    }

    /** Çağrıyı hatayla kapatır; süren satın alma çağrısıysa onu da bırakır (düğme takılı kalmasın). */
    private void fail(PluginCall call, String message, String code) {
        synchronized (this) {
            if (buyCall == call) buyCall = null;
        }
        call.reject(message, code);
    }

    /** İşi çalıştırır; beklenmeyen bir hata çağrıyı yanıtsız bırakmasın diye hatayı çağrıya bildirir. */
    private void safely(PluginCall call, Runnable run) {
        try {
            run.run();
        } catch (Throwable t) {
            fail(call, "Google Play hatası: " + t.getClass().getSimpleName(), "store_error");
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (client != null) client.endConnection();
        } catch (Exception ignored) {
            // kapanışta bağlantı zaten kopmuş olabilir
        }
        super.handleOnDestroy();
    }

    /** Google Play bağlantısı hazırsa işi hemen, değilse bağlanınca çalıştırır; bağlanamazsa çağrıyı reddeder. */
    private void whenReady(final PluginCall call, final Runnable run) {
        if (client == null) {
            fail(call, "Google Play Faturalandırma bu cihazda başlatılamadı", "billing_unavailable");
            return;
        }
        boolean start = false;
        boolean ready;
        try {
            ready = client.isReady();
        } catch (Throwable t) {
            ready = false;
        }
        synchronized (this) {
            if (!ready) {
                waiting.add(() -> safely(call, run));
                waitingCalls.add(call);
                if (connecting) return;
                connecting = true;
                start = true;
            }
        }
        if (!start) {
            safely(call, run);
            return;
        }
        try {
            client.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(BillingResult r) {
                    List<Runnable> runs;
                    List<PluginCall> calls;
                    synchronized (DonguStorePlugin.this) {
                        connecting = false;
                        runs = new ArrayList<>(waiting);
                        calls = new ArrayList<>(waitingCalls);
                        waiting.clear();
                        waitingCalls.clear();
                    }
                    if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (Runnable x : runs) x.run();
                    } else {
                        for (PluginCall c : calls) fail(c, text(r), code(r));
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    synchronized (DonguStorePlugin.this) {
                        connecting = false;
                    }
                }
            });
        } catch (Throwable t) {
            List<PluginCall> calls;
            synchronized (this) {
                connecting = false;
                calls = new ArrayList<>(waitingCalls);
                waiting.clear();
                waitingCalls.clear();
            }
            for (PluginCall c : calls) fail(c, "Google Play'e bağlanılamadı", "billing_unavailable");
        }
    }

    @PluginMethod
    public void getProducts(final PluginCall call) {
        final List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        try {
            JSArray ids = call.getArray("ids");
            if (ids != null) {
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.getString(i);
                    if (id != null && !id.isEmpty()) {
                        list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
                    }
                }
            }
        } catch (Exception e) {
            call.reject("ids okunamadı", "bad_args");
            return;
        }
        if (list.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("products", new JSArray());
            call.resolve(empty);
            return;
        }
        whenReady(call, () -> client.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(list).build(),
            (r, result) -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(text(r), code(r));
                    return;
                }
                JSArray arr = new JSArray();
                for (ProductDetails d : result.getProductDetailsList()) {
                    synchronized (details) {
                        details.put(d.getProductId(), d);
                    }
                    JSObject p = new JSObject();
                    p.put("id", d.getProductId());
                    p.put("title", d.getName());
                    ProductDetails.OneTimePurchaseOfferDetails o = d.getOneTimePurchaseOfferDetails();
                    if (o != null) {
                        p.put("price", o.getFormattedPrice());
                        p.put("micros", o.getPriceAmountMicros());
                        p.put("currency", o.getPriceCurrencyCode());
                    }
                    arr.put(p);
                }
                JSObject ret = new JSObject();
                ret.put("products", arr);
                call.resolve(ret);
            }));
    }

    @PluginMethod
    public void purchase(final PluginCall call) {
        final String id = call.getString("id", "");
        final String account = call.getString("account", "");
        final ProductDetails d;
        synchronized (details) {
            d = details.get(id);
        }
        if (d == null) {
            call.reject("Ürün bilgisi yok: " + id, "unavailable");
            return;
        }
        synchronized (this) {
            if (buyCall != null) {
                call.reject("Süren bir satın alma var", "busy");
                return;
            }
            buyCall = call;
        }
        whenReady(call, () -> getActivity().runOnUiThread(() -> safely(call, () -> {
            BillingFlowParams.ProductDetailsParams pp = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build();
            BillingFlowParams.Builder b = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(pp));
            if (account != null && !account.isEmpty()) b.setObfuscatedAccountId(account); // oyuncu kimliği (rastgele; kişisel bilgi değil): sunucu satın almanın bu hesaba ait olduğunu denetler
            BillingResult r = client.launchBillingFlow(getActivity(), b.build());
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) fail(call, text(r), code(r));
        })));
    }

    private synchronized PluginCall takeBuyCall() {
        PluginCall c = buyCall;
        buyCall = null;
        return c;
    }

    /** Google Play ödeme sonucunu bildirir: ödeme penceresinin sonucu ya da sonradan onaylanan (bekleyen) ödeme. */
    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall c = takeBuyCall();
        if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            JSObject ret = new JSObject();
            ret.put("purchases", toArray(purchases));
            if (c != null) c.resolve(ret);
            else notifyListeners("purchases", ret);
        } else if (c != null) {
            c.reject(text(r), code(r));
        }
    }

    @PluginMethod
    public void pending(final PluginCall call) {
        whenReady(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (r, purchases) -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(text(r), code(r));
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("purchases", toArray(purchases));
                call.resolve(ret);
            }));
    }

    @PluginMethod
    public void finish(final PluginCall call) {
        final String token = call.getString("token", "");
        if (token == null || token.isEmpty()) {
            call.reject("token yok", "bad_args");
            return;
        }
        whenReady(call, () -> client.consumeAsync(
            ConsumeParams.newBuilder().setPurchaseToken(token).build(),
            (r, t) -> {
                int rc = r.getResponseCode();
                // ITEM_NOT_OWNED: sunucu satın almayı Google Play'de zaten tüketmiş; sorun değil
                if (rc == BillingClient.BillingResponseCode.OK || rc == BillingClient.BillingResponseCode.ITEM_NOT_OWNED) call.resolve(new JSObject());
                else call.reject(text(r), code(r));
            }));
    }

    private static JSArray toArray(List<Purchase> list) {
        JSArray arr = new JSArray();
        if (list == null) return arr;
        for (Purchase p : list) {
            int ps = p.getPurchaseState();
            String state = ps == Purchase.PurchaseState.PURCHASED ? "purchased" : ps == Purchase.PurchaseState.PENDING ? "pending" : "unknown";
            for (String id : p.getProducts()) {
                JSObject o = new JSObject();
                o.put("id", id);
                o.put("token", p.getPurchaseToken());
                o.put("state", state);
                o.put("orderId", p.getOrderId());
                o.put("time", p.getPurchaseTime());
                arr.put(o);
            }
        }
        return arr;
    }

    private static String code(BillingResult r) {
        int rc = r.getResponseCode();
        if (rc == BillingClient.BillingResponseCode.USER_CANCELED) return "cancelled";
        if (rc == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) return "owned";
        if (rc == BillingClient.BillingResponseCode.ITEM_UNAVAILABLE) return "unavailable";
        if (rc == BillingClient.BillingResponseCode.BILLING_UNAVAILABLE) return "billing_unavailable";
        if (rc == BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE || rc == BillingClient.BillingResponseCode.SERVICE_DISCONNECTED || rc == BillingClient.BillingResponseCode.NETWORK_ERROR) return "network";
        return "store_" + rc;
    }

    private static String text(BillingResult r) {
        String m = r.getDebugMessage();
        return "Google Play " + r.getResponseCode() + (m == null || m.isEmpty() ? "" : ": " + m);
    }
}
