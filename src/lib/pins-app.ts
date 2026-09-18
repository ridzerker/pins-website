// Set only after the installed production app's exact opening URL is verified.
// The adjacent Expo app declares the "pins" scheme, but no production target is documented.
// Keep null for the honest "Open Pins on your device" / website fallback.
// Never append incoming confirmation tokens or query parameters to this URL.
export const pinsAppOpenUrl: string | null = null;
