document.addEventListener("DOMContentLoaded", () => {
    // Vanilla PJAX implementation for SPA-like Django Admin navigation
    function initPjax() {
        const handleLinkClick = async (e) => {
            const link = e.target.closest("a");
            if (!link) return;
            
            // Skip external links, hashes, logouts, open-in-new-tab, or non-HTML targets
            const url = new URL(link.href, window.location.origin);
            if (url.origin !== window.location.origin) return;
            if (link.getAttribute("target") === "_blank") return;
            if (link.getAttribute("download")) return;
            if (url.pathname.startsWith("/admin/logout/")) return; // Let logout reload normally
            if (link.href.includes("#") && link.href.split("#")[0] === window.location.href.split("#")[0]) return;
            
            // Only handle admin subpages
            if (!url.pathname.startsWith("/admin/")) return;
            
            e.preventDefault();
            await navigateTo(url.href);
        };

        const handleFormSubmit = async (e) => {
            const form = e.target;
            // Skip file upload forms or non-admin forms
            if (form.getAttribute("enctype") === "multipart/form-data") return;
            const url = new URL(form.action || window.location.href, window.location.origin);
            if (url.origin !== window.location.origin) return;
            if (!url.pathname.startsWith("/admin/")) return;

            e.preventDefault();
            
            const formData = new FormData(form);
            const searchParams = new URLSearchParams(formData);
            const method = (form.method || "GET").toUpperCase();
            
            let fetchOptions = { method };
            let fetchUrl = url.href;
            
            if (method === "GET") {
                fetchUrl = `${url.pathname}?${searchParams.toString()}`;
            } else {
                fetchOptions.body = searchParams;
                fetchOptions.headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-CSRFToken": document.querySelector("[name=csrfmiddlewaretoken]")?.value || ""
                };
            }
            
            await navigateTo(fetchUrl, fetchOptions);
        };

        document.addEventListener("click", handleLinkClick);
        document.addEventListener("submit", handleFormSubmit);
        
        window.addEventListener("popstate", () => {
            navigateTo(window.location.href, null, false);
        });
    }

    async function navigateTo(url, options = null, push = true) {
        // Show premium teal progress bar
        const progress = document.createElement("div");
        progress.style.cssText = "position:fixed;top:0;left:0;height:3px;background:#14b8a6;width:0;transition:width 0.4s ease;z-index:99999;box-shadow:0 0 10px rgba(20,184,166,0.6)";
        document.body.appendChild(progress);
        setTimeout(() => progress.style.width = "45%", 10);
        
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                if (response.redirected) {
                    window.location.href = response.url;
                    return;
                }
                throw new Error("Fetch failed");
            }
            
            const htmlText = await response.text();
            progress.style.width = "100%";
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");
            
            document.title = doc.title;
            
            // Swap main content area
            const currentMain = document.querySelector("main");
            const newMain = doc.querySelector("main");
            
            if (currentMain && newMain) {
                currentMain.innerHTML = newMain.innerHTML;
                
                // Update sidebar links active/inactive classes
                const currentSidebar = document.querySelector("aside");
                const newSidebar = doc.querySelector("aside");
                if (currentSidebar && newSidebar) {
                    currentSidebar.innerHTML = newSidebar.innerHTML;
                }
            } else {
                document.body.innerHTML = doc.body.innerHTML;
            }
            
            if (push) {
                window.history.pushState(null, "", url);
            }
            
            // Reinitialize Alpine.js components
            if (window.Alpine) {
                window.Alpine.discover();
            }
            
            // Re-execute scripts within the swapped main layout
            const scripts = currentMain ? currentMain.querySelectorAll("script") : [];
            scripts.forEach(script => {
                const newScript = document.createElement("script");
                Array.from(script.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.appendChild(document.createTextNode(script.innerHTML));
                script.parentNode.replaceChild(newScript, script);
            });
            
        } catch (error) {
            console.error("PJAX failure, reloading:", error);
            window.location.href = url;
        } finally {
            setTimeout(() => progress.remove(), 300);
        }
    }

    initPjax();
});
