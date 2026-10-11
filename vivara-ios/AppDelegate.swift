import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let controller = UIViewController()
        controller.view.backgroundColor = UIColor(red: 0.035, green: 0.029, blue: 0.075, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let game = WKWebView(frame: .zero, configuration: configuration)
        game.isOpaque = false
        game.backgroundColor = controller.view.backgroundColor
        game.scrollView.isScrollEnabled = false
        game.scrollView.contentInsetAdjustmentBehavior = .never
        game.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(game)
        NSLayoutConstraint.activate([
            game.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor),
            game.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor),
            game.topAnchor.constraint(equalTo: controller.view.topAnchor),
            game.bottomAnchor.constraint(equalTo: controller.view.bottomAnchor)
        ])
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else { return false }
        game.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        return true
    }
}
