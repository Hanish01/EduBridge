// Simple global online/offline detection and banner
(function () {
    function ensureBanner() {
        var existing = document.getElementById("offline-banner");
        if (existing) return existing;

        var banner = document.createElement("div");
        banner.id = "offline-banner";
        banner.style.position = "fixed";
        banner.style.left = "0";
        banner.style.right = "0";
        banner.style.bottom = "0";
        banner.style.zIndex = "9999";
        banner.style.background = "#ffc107";
        banner.style.color = "#212529";
        banner.style.padding = "10px 16px";
        banner.style.display = "none";
        banner.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        banner.style.fontSize = "14px";
        banner.style.boxShadow = "0 -2px 6px rgba(0,0,0,0.15)";

        var text = document.createElement("span");
        text.id = "offline-banner-text";
        text.textContent =
            "You are offline. Saved lessons and cached content are still available.";

        var actions = document.createElement("span");
        actions.style.float = "right";

        var btn = document.createElement("a");
        btn.href = "downloaded.html";
        btn.textContent = "Open downloaded content";
        btn.style.marginLeft = "12px";
        btn.style.textDecoration = "underline";
        btn.style.color = "#212529";
        btn.style.fontWeight = "600";

        actions.appendChild(btn);
        banner.appendChild(text);
        banner.appendChild(actions);

        document.body.appendChild(banner);
        return banner;
    }

    function showOffline() {
        var banner = ensureBanner();
        banner.style.display = "block";
    }

    function hideOffline() {
        var banner = document.getElementById("offline-banner");
        if (banner) {
            banner.style.display = "none";
        }
    }

    function handleInitialState() {
        if (navigator.onLine === false) {
            showOffline();
        }
    }

    window.addEventListener("offline", function () {
        showOffline();
        // Optional lightweight redirect to offline-friendly page for students
        var path = window.location.pathname || "";
        if (!/downloaded\.html$/i.test(path) && /lesson\.html|student\.html/i.test(path)) {
            // Keep bandwidth low: simple redirect, no extra requests
            window.location.href = "downloaded.html";
        }
    });

    window.addEventListener("online", function () {
        hideOffline();
    });

    if (document.readyState === "complete" || document.readyState === "interactive") {
        handleInitialState();
    } else {
        document.addEventListener("DOMContentLoaded", handleInitialState);
    }
})();

