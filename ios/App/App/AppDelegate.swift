import UIKit
import Capacitor
import FirebaseCore
import TikTokBusinessSDK
import AppTrackingTransparency

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var didRequestATT = false

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {

        FirebaseApp.configure()

        let config = TikTokConfig(
            appId: "7658586227125272594",
            tiktokAppId: "6770395386"            
        )

        TikTokBusiness.initializeSdk(config) { success, error in
    if success {
        print("TikTok Business SDK initialized")

        let testEvent = TikTokAppEvent(eventName: "view_content")
        TikTokBusiness.getInstance().report(testEvent)
        TikTokBusiness.explicitlyFlush()

        print("TikTok test event submitted: view_content")
    } else {
        print("TikTok Business SDK init failed: \(String(describing: error))")
    }
}

        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        requestTrackingPermissionIfNeeded()
    }

    private func requestTrackingPermissionIfNeeded() {
        guard !didRequestATT else { return }
        didRequestATT = true

        if #available(iOS 14, *) {
            guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined else {
                print("ATT status: \(ATTrackingManager.trackingAuthorizationStatus.rawValue)")
                return
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                ATTrackingManager.requestTrackingAuthorization { status in
                    print("ATT status: \(status.rawValue)")
                }
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey : Any] = [:]
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            app,
            open: url,
            options: options
        )
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }
}
