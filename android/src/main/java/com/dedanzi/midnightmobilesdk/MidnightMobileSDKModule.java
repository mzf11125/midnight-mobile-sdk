package com.dedanzi.midnightmobilesdk;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.util.Base64;

import java.io.File;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

public class MidnightMobileSDKModule extends ReactContextBaseJavaModule implements ActivityEventListener {

    private static final String ECRYPTED_SHARED_PREFS_NAME = "midnight_encrypted_prefs";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String MASTER_KEY_ALIAS = "midnight_master_key";

    private final Map<String, Object> walletStore = new HashMap<>();
    private EncryptedSharedPreferences encryptedPrefs;
    private ReactApplicationContext reactContext;

    public MidnightMobileSDKModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        reactContext.addActivityEventListener(this);
        initializeSecureStorage(reactContext);
    }

    @Override
    public String getName() {
        return "MidnightMobileSDK";
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("PROTOCOL_VERSION", "1.0.0");
        constants.put("NETWORKS", new String[]{"testnet", "preprod", "mainnet"});
        return constants;
    }

    // ============================================================
    // Wallet Management
    // ============================================================

    @ReactMethod
    public void createWallet(String network, boolean requireBiometrics,
                             Promise promise) {
        try {
            String mnemonic = generateMnemonic();
            String address = deriveAddress(mnemonic, network);
            String publicKey = derivePublicKey(mnemonic);

            walletStore.put("currentWallet", new HashMap<String, Object>() {{
                put("mnemonic", mnemonic);
                put("network", network);
                put("requireBiometrics", requireBiometrics);
                put("createdAt", System.currentTimeMillis());
            }});

            WritableMap result = Arguments.createMap();
            result.putString("address", address);
            result.putString("publicKey", publicKey);
            result.putString("network", network);

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("CREATE_WALLET_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void importWallet(String mnemonic, String network, Promise promise) {
        try {
            if (!validateMnemonic(mnemonic)) {
                promise.reject("INVALID_MNEMONIC", "Invalid mnemonic phrase");
                return;
            }

            String address = deriveAddress(mnemonic, network);
            String publicKey = derivePublicKey(mnemonic);

            walletStore.put("currentWallet", new HashMap<String, Object>() {{
                put("mnemonic", mnemonic);
                put("network", network);
                put("imported", true);
                put("createdAt", System.currentTimeMillis());
            }});

            WritableMap result = Arguments.createMap();
            result.putString("address", address);
            result.putString("publicKey", publicKey);
            result.putString("network", network);

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("IMPORT_WALLET_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getWalletInfo(Promise promise) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> walletInfo = (Map<String, Object>) walletStore.get("currentWallet");

            if (walletInfo == null) {
                promise.reject("WALLET_NOT_FOUND", "No wallet found");
                return;
            }

            String mnemonic = (String) walletInfo.get("mnemonic");
            String network = (String) walletInfo.get("network");

            WritableMap result = Arguments.createMap();
            result.putString("address", deriveAddress(mnemonic, network));
            result.putString("publicKey", derivePublicKey(mnemonic));
            result.putString("network", network);

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("GET_WALLET_INFO_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void lockWallet(Promise promise) {
        walletStore.remove("unlocked");

        WritableMap event = Arguments.createMap();
        event.putDouble("timestamp", System.currentTimeMillis());
        sendEvent("onWalletLocked", event);

        WritableMap result = Arguments.createMap();
        result.putBoolean("locked", true);
        promise.resolve(result);
    }

    @ReactMethod
    public void unlockWallet(boolean useBiometrics, Promise promise) {
        if (useBiometrics) {
            authenticate("Authenticate to unlock your wallet", new BiometricCallback() {
                @Override
                public void onResult(boolean success, String error) {
                    if (success) {
                        walletStore.put("unlocked", true);
                        WritableMap result = Arguments.createMap();
                        result.putBoolean("unlocked", true);
                        promise.resolve(result);
                    } else {
                        promise.reject("BIOMETRIC_FAILED", error);
                    }
                }
            });
        } else {
            walletStore.put("unlocked", true);
            WritableMap result = Arguments.createMap();
            result.putBoolean("unlocked", true);
            promise.resolve(result);
        }
    }

    @ReactMethod
    public void wipeWallet(Promise promise) {
        walletStore.clear();
        WritableMap result = Arguments.createMap();
        result.putBoolean("wiped", true);
        promise.resolve(result);
    }

    // ============================================================
    // Biometric Authentication
    // ============================================================

    @ReactMethod
    public void authenticateBiometric(String prompt, Promise promise) {
        authenticate(prompt, new BiometricCallback() {
            @Override
            public void onResult(boolean success, String error) {
                if (success) {
                    WritableMap result = Arguments.createMap();
                    result.putBoolean("success", true);
                    promise.resolve(result);
                } else {
                    promise.reject("AUTH_FAILED", error);
                }
            }
        });
    }

    @ReactMethod
    public void checkBiometricCapability(Promise promise) {
        FragmentActivity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity found");
            return;
        }

        BiometricManager biometricManager = BiometricManager.from(activity);
        int canAuthenticate = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);

        WritableMap result = Arguments.createMap();
        result.putBoolean("available", canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS);
        result.putBoolean("enrolled", canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS);

        String biometricType = "none";
        if (canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS) {
            // Check for specific biometric type
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                android.hardware.biometrics.BiometricManager bm = android.hardware.biometrics.BiometricManager.from(activity);
                if (bm.canAuthenticate(android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL | android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK) == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS) {
                    // Try to determine type - this is platform-specific
                    biometricType = "fingerprint"; // Default assumption
                }
            }
        }

        result.putString("biometricType", biometricType);
        promise.resolve(result);
    }

    // ============================================================
    // Deep Links
    // ============================================================

    @ReactMethod
    public void handleDeepLink(String url, Promise promise) {
        WritableMap event = Arguments.createMap();
        event.putString("url", url);
        sendEvent("onDeepLink", event);

        WritableMap result = Arguments.createMap();
        result.putBoolean("handled", true);
        promise.resolve(result);
    }

    @ReactMethod
    public void generateDeepLink(String type, ReadableMap params, Promise promise) {
        StringBuilder url = new StringBuilder("midnight://").append(type);

        if (params != null && params.toArrayList().size() > 0) {
            url.append("?");
            boolean first = true;
            for (String key : params.toHashMap().keySet()) {
                if (!first) {
                    url.append("&");
                }
                String value = params.getString(key);
                url.append(key).append("=").append(urlEncode(value));
                first = false;
            }
        }

        WritableMap result = Arguments.createMap();
        result.putString("url", url.toString());
        promise.resolve(result);
    }

    // ============================================================
    // Secure Storage
    // ============================================================

    @ReactMethod
    public void secureSetItem(String key, String value, Promise promise) {
        try {
            encryptedPrefs.edit().putString(key, value).apply();
            WritableMap result = Arguments.createMap();
            result.putBoolean("success", true);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SECURE_STORE_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void secureGetItem(String key, Promise promise) {
        try {
            String value = encryptedPrefs.getString(key, null);
            WritableMap result = Arguments.createMap();
            if (value != null) {
                result.putString("value", value);
            } else {
                result.putNull("value");
            }
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SECURE_STORE_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void secureDeleteItem(String key, Promise promise) {
        try {
            encryptedPrefs.edit().remove(key).apply();
            WritableMap result = Arguments.createMap();
            result.putBoolean("success", true);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SECURE_STORE_ERROR", e.getMessage(), e);
        }
    }

    // ============================================================
    // Helper Methods
    // ============================================================

    private void initializeSecureStorage(Context context) {
        try {
            MasterKey masterKey = new MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .setUserAuthenticationRequired(false)
                    .build();

            encryptedPrefs = (EncryptedSharedPreferences) EncryptedSharedPreferences.create(
                    context,
                    ECRYPTED_SHARED_PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private interface BiometricCallback {
        void onResult(boolean success, String error);
    }

    private void authenticate(String prompt, BiometricCallback callback) {
        FragmentActivity activity = getCurrentActivity();
        if (activity == null) {
            callback.onResult(false, "No activity found");
            return;
        }

        BiometricManager biometricManager = BiometricManager.from(activity);
        if (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) != BiometricManager.BIOMETRIC_SUCCESS) {
            callback.onResult(false, "Biometric authentication not available");
            return;
        }

        CountDownLatch latch = new CountDownLatch(1);
        final boolean[] result = {false};
        final String[] error = {null};

        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(prompt)
                .setNegativeButtonText("Cancel")
                .build();

        BiometricPrompt biometricPrompt = new BiometricPrompt(activity,
                Executors.newSingleThreadExecutor(),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        result[0] = true;
                        latch.countDown();
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        error[0] = "Authentication failed";
                        latch.countDown();
                    }

                    @Override
                    public void onError(int errorCode, @NonNull CharSequence errString) {
                        error[0] = errString.toString();
                        latch.countDown();
                    }
                });

        activity.runOnUiThread(() -> biometricPrompt.authenticate(promptInfo));

        try {
            latch.await();
            callback.onResult(result[0], error[0]);
        } catch (InterruptedException e) {
            callback.onResult(false, e.getMessage());
        }
    }

    private String generateMnemonic() {
        // Placeholder - would use BIP39 in production
        String[] words = {
                "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
                "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid"
        };

        StringBuilder mnemonic = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            if (i > 0) mnemonic.append(" ");
            int index = (int) (Math.random() * words.length);
            mnemonic.append(words[index]);
        }
        return mnemonic.toString();
    }

    private boolean validateMnemonic(String mnemonic) {
        String[] words = mnemonic.split("\\s+");
        return words.length == 12 || words.length == 24;
    }

    private String deriveAddress(String mnemonic, String network) {
        // Placeholder - actual implementation would use BIP-32/44
        String prefix = network.equals("mainnet") ? "mid" :
                        network.equals("preprod") ? "ppmid" : "tmid";

        String hash = bytesToHex(mnemonic.getBytes(StandardCharsets.UTF_8)).substring(0, 40);
        return prefix + "1" + hash;
    }

    private String derivePublicKey(String mnemonic) {
        // Placeholder - actual implementation would use HD key derivation
        return bytesToHex(mnemonic.getBytes(StandardCharsets.UTF_8)).substring(0, 64);
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte b : bytes) {
            result.append(String.format("%02x", b));
        }
        return result.toString();
    }

    private String urlEncode(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return value;
        }
    }

    private void sendEvent(String eventName, Object data) {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, data);
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        // Handle activity results if needed
    }

    @Override
    public void onNewIntent(Intent intent) {
        // Handle deep links
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            String url = intent.getData().toString();
            WritableMap event = Arguments.createMap();
            event.putString("url", url);
            sendEvent("onDeepLink", event);
        }
    }
}
