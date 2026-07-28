import UIKit
import Capacitor
import FirebaseCore
import FBSDKCoreKit
import TikTokBusinessSDK
import AppTrackingTransparency

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var didRequestATT = false

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [
            UIApplication.LaunchOptionsKey: Any
        ]?
    ) -> Bool {

        // Firebase
        FirebaseApp.configure()

        // Meta / Facebook SDK
        ApplicationDelegate.shared.application(
            application,
            didFinishLaunchingWithOptions: launchOptions
        )

        print("Facebook SDK initialized")   

        // TikTok SDK
        initializeTikTokSDK()

        return true
    }

    func applicationDidBecomeActive(
    _ application: UIApplication
) {
    requestTrackingPermissionIfNeeded()

    AppEvents.shared.activateApp()    
}

    private func initializeTikTokSDK() {
        guard
            let appSecret = Bundle.main.object(
                forInfoDictionaryKey: "TikTokAppSecret"
            ) as? String,
            !appSecret.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty,
            !appSecret.contains("$(")
        else {
            print("TikTok App Secret is missing or unresolved")
            return
        }

        let config = TikTokConfig(
            accessToken: appSecret,
            appId: "7658586227125272594",
            tiktokAppId: "6770395386"
        )

        TikTokBusiness.initializeSdk(config) { success, error in
            if success {
                print("TikTok Business SDK initialized")

                let launchEvent = TikTokAppEvent(
                    eventName: "launch_app"
                )

                TikTokBusiness.getInstance().report(launchEvent)
                TikTokBusiness.explicitlyFlush()

                print("launch_app submitted")
            } else {
                print("TikTok SDK init failed")
                print(error ?? "unknown error")
            }
        }
    }

    private func requestTrackingPermissionIfNeeded() {
    guard !didRequestATT else {
        return
    }

    didRequestATT = true

    guard #available(iOS 14, *) else {
        Settings.shared.isAdvertiserIDCollectionEnabled = true
        return
    }

    let currentStatus = ATTrackingManager.trackingAuthorizationStatus

    if currentStatus != .notDetermined {
        applyTrackingStatus(currentStatus)
        return
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        ATTrackingManager.requestTrackingAuthorization { status in
            DispatchQueue.main.async {
                self.applyTrackingStatus(status)
            }
        }
    }
}

@available(iOS 14, *)
private func applyTrackingStatus(
    _ status: ATTrackingManager.AuthorizationStatus
) {
    let authorized = status == .authorized

    Settings.shared.isAdvertiserIDCollectionEnabled = authorized

    print("ATT status: \(status.rawValue)")
    print("Facebook advertiser ID collection: \(authorized)")
}

    func applicationWillResignActive(
        _ application: UIApplication
    ) {
    }

    func applicationDidEnterBackground(
        _ application: UIApplication
    ) {
    }

    func applicationWillEnterForeground(
        _ application: UIApplication
    ) {
    }

    func applicationWillTerminate(
        _ application: UIApplication
    ) {
    }

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [
            UIApplication.OpenURLOptionsKey: Any
        ] = [:]
    ) -> Bool {

        let handledByFacebook =
            ApplicationDelegate.shared.application(
                app,
                open: url,
                options: options
            )

        let handledByCapacitor =
            ApplicationDelegateProxy.shared.application(
                app,
                open: url,
                options: options
            )

        return handledByFacebook || handledByCapacitor
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping (
            [UIUserActivityRestoring]?
        ) -> Void
    ) -> Bool {

        return ApplicationDelegateProxy.shared.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }
}