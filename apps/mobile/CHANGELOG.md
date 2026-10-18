# Changelog

## [0.0.2](https://github.com/paveproject/pave/compare/mobile@v0.0.1...mobile@v0.0.2) (2026-10-18)


### Features

* **api,mobile:** check minimum supported app version on launch ([4b51839](https://github.com/paveproject/pave/commit/4b51839271ef2e00f4e2c21f971e1c9196abf256))
* **api,mobile:** configurable recovery delay + protest mode ([2b3e5b2](https://github.com/paveproject/pave/commit/2b3e5b2271828b47bddd8e1e68f64047040bab8a))
* **api,mobile:** username onboarding, route review, S3 test coverage ([8324ddf](https://github.com/paveproject/pave/commit/8324ddf4894d83c4e605f24846ffb3917499163d))
* **auth:** switch to OTP-only sign-in, add avatar and push-token endpoints ([e041f2c](https://github.com/paveproject/pave/commit/e041f2cde6fd9f528d489b9142a75c0d382f2ea5))
* check minimum supported app version on launch ([a68468a](https://github.com/paveproject/pave/commit/a68468a9eef2bca743712a823cbebf089ed60b3f))
* **map:** offline-first incident reporting with PostGIS and TrueSheet ([80edf71](https://github.com/paveproject/pave/commit/80edf71f558c8df90565116ddcfac5b096e03d0a))
* **mobile:** switch realtime to native WebSocket, drop socket.io ([3aface9](https://github.com/paveproject/pave/commit/3aface986c7b9f3e170f7899b2a7d7c77d96b1e7))
* **mobile:** user-facing debug mode toggle via version-footer triple-tap ([c988f06](https://github.com/paveproject/pave/commit/c988f0644707b3f87c9202c9a22f738d5e0d5f51))
* **notify:** send real FCM/APNs push notifications ([d26243b](https://github.com/paveproject/pave/commit/d26243b1340b6a1a399d82ea655fa597973a4719))
* **push:** send real FCM/APNs push notifications from notify ([147ec48](https://github.com/paveproject/pave/commit/147ec48a4e722ee335c388cbdd3cd9bd9c1e76fb))
* **recovery-key:** multi-device sync, localized push notifications, native debug UI ([858d76d](https://github.com/paveproject/pave/commit/858d76d5717bc72fcd903bd748f4b60c5b9804f5))
* **repo:** trusted contacts, recovery key, protest mode ([5053a13](https://github.com/paveproject/pave/commit/5053a139244030ded7ed8c3fb16b1f1b67e3560c))
* **trusted-contacts:** designate trusted contacts + personal realtime channel ([c485570](https://github.com/paveproject/pave/commit/c485570e902537a6b5b29813bb1d40c1768c8f80))
* **trusted-contacts:** generate and split a recovery key across trusted contacts ([9c87868](https://github.com/paveproject/pave/commit/9c87868e0373d0d2803367ac33af18a606300d66))


### Bug Fixes

* clear pre-existing lint errors blocking affected mobile/db/query-client ([75b2fb8](https://github.com/paveproject/pave/commit/75b2fb8970baec25e9fb8889a57b221350084008))
* **mobile:** add missing JSON import attribute in app.config.ts ([e725142](https://github.com/paveproject/pave/commit/e72514298c45d739e811bd51e443e5a27f9fffe5))
* **mobile:** bundle identifier org.pave.app -&gt; org.paveproject.app ([b1d4b93](https://github.com/paveproject/pave/commit/b1d4b937577632f32b094c348ae616c56ba5ec74))
* **mobile:** import type for ExpoConfig/ConfigContext in app.config.ts ([86fee37](https://github.com/paveproject/pave/commit/86fee375e656d8f734b8c9ff14924a284e09d20d))
* **mobile:** offline-first language sync with backend ([d35feb2](https://github.com/paveproject/pave/commit/d35feb2d062f0ce688db43ff98bb95c800c5900c))
* **mobile:** propagate forced color scheme to Compose, add shared NativeButton/useThemes ([25dc2c6](https://github.com/paveproject/pave/commit/25dc2c60556d561a9547a37d2ace29d39eaa23a6))
* **mobile:** rename constants/Colors.ts and Assets.ts to match their imports ([bd82851](https://github.com/paveproject/pave/commit/bd82851a780b608db8e32102b86ef190489630d3))
* **mobile:** self-heal invalid persisted locale value ([9d4e0bb](https://github.com/paveproject/pave/commit/9d4e0bbe6c156e9e8f4931832651c5e72faa48d9))
* **mobile:** stale username-availability cache, debounced check, input focus loss ([75d77ab](https://github.com/paveproject/pave/commit/75d77ab11196a8ef0ea1f3cea477e40dd05a26dc))
* **mobile:** theme preference system, misc UI and copy fixes ([696d540](https://github.com/paveproject/pave/commit/696d54028d1529ed1a03f3fe83c63e9f6cace390))
