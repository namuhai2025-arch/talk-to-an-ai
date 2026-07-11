package com.talkio.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.HashMap;
import com.tiktok.TikTokBusinessSdk;

public class MainActivity extends BridgeActivity {

    private static final String TALKIO_PACKAGE_ID = "com.talkio.app";
    private static final String TIKTOK_APP_ID = "7658585151747768327";

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

        FirebaseAuth auth = FirebaseAuth.getInstance();

        if (auth.getCurrentUser() == null) {
            auth.signInAnonymously()
                    .addOnSuccessListener(authResult -> {
                        Log.d("TalkioFCM", "Anonymous sign-in success");
                        Log.d("TalkioFCM", "Current UID: " + auth.getCurrentUser().getUid());
                        requestAndSaveFcmToken();
                    })
                    .addOnFailureListener(e -> {
                        Log.e("TalkioFCM", "Anonymous sign-in failed", e);
                    });
        } else {
            Log.d("TalkioFCM", "Current UID: " + auth.getCurrentUser().getUid());
            requestAndSaveFcmToken();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null) return;

        Uri uri = intent.getData();
        if (uri == null) return;

        String source = uri.getQueryParameter("source");
        String url = uri.toString();

        Log.d("TalkioDeepLink", "Opened URL: " + url);

        if ("checkin".equals(source)) {
            String safeUrl = url.replace("\\", "\\\\").replace("\"", "\\\"");

            getBridge().triggerWindowJSEvent(
                    "talkioCheckinOpened",
                    "{ \"url\": \"" + safeUrl + "\" }"
            );
        }
    }

    private void requestAndSaveFcmToken() {
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        Log.e("TalkioFCM", "User not logged in. Skipping token save.");
                        return;
                    }

                    String token = task.getResult();
                    Log.d("TalkioFCM", "FCM token retrieved successfully");

                    saveTokenToFirestore(token);
                });
    }
    private void saveTokenToFirestore(String token) {
        FirebaseAuth auth = FirebaseAuth.getInstance();

        String uid = (auth.getCurrentUser() != null)
                ? auth.getCurrentUser().getUid()
                : null;

        if (uid == null) {
            Log.e("FCM_SAVE", "User not logged in. Skipping token save.");
            return;
        }

        FirebaseFirestore db = FirebaseFirestore.getInstance();

        db.collection("users")
                .document(uid)
                .set(new HashMap<String, Object>() {{
                    put("updatedAt", FieldValue.serverTimestamp());
                    put("lastPlatform", "android");
                }}, com.google.firebase.firestore.SetOptions.merge());

        db.collection("users")
                .document(uid)
                .collection("device_tokens")
                .document(token)
                .set(new HashMap<String, Object>() {{
                    put("token", token);
                    put("platform", "android");
                    put("createdAt", FieldValue.serverTimestamp());
                    put("updatedAt", FieldValue.serverTimestamp());
                }}, com.google.firebase.firestore.SetOptions.merge())
                .addOnSuccessListener(unused ->
                        Log.d("TalkioFCM", "Token saved successfully for UID: " + uid)
                )
                .addOnFailureListener(e ->
                        Log.e("TalkioFCM", "Failed to save token", e)
                );
    }
}