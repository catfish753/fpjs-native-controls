# FPJS native Firefox controls

Collects open-source FingerprintJS components from stock Firefox 152.0.4 on
native GitHub Windows/macOS runners. Firefox opens a localhost page directly;
no WebDriver, Playwright, remote debugging, extension, or page monkeypatch is
used. These controls calibrate a Linux engine-level Windows/macOS emulator.

Schema 2 also mirrors and locally decodes the Fingerprint Pro agent request as
`proPayload.signals`. The public demo key rejects localhost after collection;
that expected `forbidden` response does not affect the captured native signals.
The request is observed, not modified, and is never replayed.
