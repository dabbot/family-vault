import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function InstallAppButton({ className, onClick }: { className?: string; onClick?: () => void }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const installedHandler = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    onClick?.();
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      } catch {
        setOpen(true);
      }
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          className,
        )}
      >
        <Download className="h-4 w-4" />
        Install app
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> Add to Home Screen
            </DialogTitle>
            <DialogDescription>
              Install Family Vault on your phone for one-tap access.
            </DialogDescription>
          </DialogHeader>

          {platform === "ios" && (
            <ol className="space-y-2 text-sm text-foreground">
              <li>1. Tap the <strong>Share</strong> button in Safari (the square with an arrow).</li>
              <li>2. Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>3. Tap <strong>Add</strong> in the top right corner.</li>
            </ol>
          )}
          {platform === "android" && (
            <ol className="space-y-2 text-sm text-foreground">
              <li>1. Tap the <strong>⋮ menu</strong> in Chrome (top right).</li>
              <li>2. Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
              <li>3. Confirm by tapping <strong>Install</strong>.</li>
            </ol>
          )}
          {platform === "desktop" && (
            <div className="space-y-3 text-sm text-foreground">
              <p>Open this site on your phone to add it to your home screen:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li><strong>iPhone:</strong> Safari → Share → Add to Home Screen</li>
                <li><strong>Android:</strong> Chrome → ⋮ → Add to Home screen</li>
              </ul>
              <p className="text-muted-foreground">
                On desktop, look for the install icon in your browser's address bar.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => setOpen(false)}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
