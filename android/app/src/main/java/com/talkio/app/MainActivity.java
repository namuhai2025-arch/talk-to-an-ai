    package com.talkio.app;

    import android.content.Intent;
    import android.net.Uri;
    import android.os.Bundle;
    import android.util.Log;

    import com.getcapacitor.BridgeActivity;
    import com.google.firebase.auth.FirebaseAuth;
    import com.google.firebase.firestore.FieldValue;
    import com.google.firebase.firestore.FirebaseFirestore;
    import com.google.firebase.firestore.SetOptions;
    import com.google.firebase.messaging.FirebaseMessaging;
    import com.tiktok.TikTokBusinessSdk;

    import java.util.HashMap;
    import java.util.Map;

    public class MainActivity extends BridgeActivity {

        private static final String TALKIO_PACKAGE_ID = "com.talkio.app";
        private static final String TIKTOK_APP_ID = "7658585151747768327";

        private FirebaseAuth firebaseAuth;
        private FirebaseAuth.AuthStateListener authStateListener;

        private void initializeTikTokSdk() {
            try {
                if (TikTokBusinessSdk.isInitialized()) {
                    Log.d("TalkioTikTok", "TikTok SDK already initialized");
                    return;
                }

                TikTokBusinessSdk.TTConfig config =
                        new TikTokBusinessSdk.TTConfig(
                                getApplication(),
                                BuildConfig.TIKTOK_APP_SECRET
                        )
                                .setAppId(TALKIO_PACKAGE_ID)
                                .setTTAppId(TIKTOK_APP_ID);

                TikTokBusinessSdk.initializeSdk(config);

                Log.d(
                        "TalkioTikTok",
                        "TikTok SDK initialized successfully for Talkio Android"
                );
            } catch (Throwable error) {
                Log.e(
                        "TalkioTikTok",
                        "TikTok SDK initialization failed. Talkio will continue normally.",
                        error
                );
            }
        }  

        @Override
        public void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);

            initializeTikTokSdk();

            handleDeepLink(getIntent());

            firebaseAuth = FirebaseAuth.getInstance();

            authStateListener = auth -> {
                if (auth.getCurrentUser() != null) {
                    String uid = auth.getCurrentUser().getUid();

                    Log.d(
                            "TalkioFCM",
                            "Authenticated UID: " + uid
                    );

                    requestAndSaveFcmToken();
                } else {
                    Log.d(
                            "TalkioFCM",
                            "No authenticated user. Waiting for sign-in."
                    );
                }
            };

            firebaseAuth.addAuthStateListener(authStateListener);
        }

        @Override
        public void onDestroy() {
            if (firebaseAuth != null && authStateListener != null) {
                firebaseAuth.removeAuthStateListener(authStateListener);
            }

            super.onDestroy();
        }

        @Override
        protected void onNewIntent(Intent intent) {
            super.onNewIntent(intent);
            setIntent(intent);
            handleDeepLink(intent);
        }

        private void handleDeepLink(Intent intent) {
            if (intent == null) {
                return;
            }

            Uri uri = intent.getData();

            if (uri == null) {
                return;
            }

            String source = uri.getQueryParameter("source");
            String url = uri.toString();

            Log.d("TalkioDeepLink", "Opened URL: " + url);

            if ("checkin".equals(source)) {
                String safeUrl = url
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"");

                getBridge().triggerWindowJSEvent(
                        "talkioCheckinOpened",
                        "{ \"url\": \"" + safeUrl + "\" }"
                );
            }
        }

        private void requestAndSaveFcmToken() {
            FirebaseMessaging.getInstance()
                    .getToken()
                    .addOnCompleteListener(task -> {
                        if (!task.isSuccessful()) {
                            Log.e(
                                    "TalkioFCM",
                                    "Failed to retrieve FCM token",
                                    task.getException()
                            );
                            return;
                        }

                        String token = task.getResult();

                        if (token == null || token.trim().isEmpty()) {
                            Log.e("TalkioFCM", "FCM returned an empty token");
                            return;
                        }

                        Log.d(
                                "TalkioFCM",
                                "FCM token retrieved successfully"
                        );

                        saveTokenToFirestore(token);
                    });
        }

        private void saveTokenToFirestore(String token) {
            FirebaseAuth auth = FirebaseAuth.getInstance();

            if (auth.getCurrentUser() == null) {
                Log.d(
                        "TalkioFCM",
                        "User signed out before token save. Skipping."
                );
                return;
            }

            String uid = auth.getCurrentUser().getUid();
            FirebaseFirestore db = FirebaseFirestore.getInstance();

            Map<String, Object> userUpdate = new HashMap<>();
            userUpdate.put("updatedAt", FieldValue.serverTimestamp());
            userUpdate.put("lastPlatform", "android");

            db.collection("users")
                    .document(uid)
                    .set(userUpdate, SetOptions.merge())
                    .addOnFailureListener(error ->
                            Log.e(
                                    "TalkioFCM",
                                    "Failed to update user platform information",
                                    error
                            )
                    );

            Map<String, Object> tokenData = new HashMap<>();
            tokenData.put("token", token);
            tokenData.put("platform", "android");
            tokenData.put("createdAt", FieldValue.serverTimestamp());
            tokenData.put("updatedAt", FieldValue.serverTimestamp());

            db.collection("users")
                    .document(uid)
                    .collection("device_tokens")
                    .document(token)
                    .set(tokenData, SetOptions.merge())
                    .addOnSuccessListener(unused ->
                            Log.d(
                                    "TalkioFCM",
                                    "Token saved successfully for UID: " + uid
                            )
                    )
                    .addOnFailureListener(error ->
                            Log.e(
                                    "TalkioFCM",
                                    "Failed to save FCM token",
                                    error
                            )
                    );
        }
    }