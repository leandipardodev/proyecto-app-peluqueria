export async function verifyRecaptcha(token: string): Promise<{ success: boolean; score?: number }> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return { success: true };
  }

  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });

    const data = await response.json();
    return { success: data.success === true, score: data.score };
  } catch {
    return { success: true };
  }
}

export function loadRecaptchaScript(siteKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    if (document.querySelector("#recaptcha-script")) return resolve();

    const script = document.createElement("script");
    script.id = "recaptcha-script";
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    grecaptcha?: {
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
      ready: (callback: () => void) => void;
    };
  }
}

export async function getRecaptchaToken(siteKey: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const grecaptcha = window.grecaptcha;
  if (!grecaptcha) return null;
  try {
    return await grecaptcha.execute(siteKey, { action: "booking_submit" });
  } catch {
    return null;
  }
}
