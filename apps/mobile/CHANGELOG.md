# Changelog

## [0.0.2](https://github.com/paveproject/pave/compare/mobile@v0.0.1...mobile@v0.0.2) (2026-10-13)


### Features

* **api,mobile:** check minimum supported app version on launch ([4b51839](https://github.com/paveproject/pave/commit/4b51839271ef2e00f4e2c21f971e1c9196abf256))
* **auth:** switch to OTP-only sign-in, add avatar and push-token endpoints ([e041f2c](https://github.com/paveproject/pave/commit/e041f2cde6fd9f528d489b9142a75c0d382f2ea5))
* check minimum supported app version on launch ([a68468a](https://github.com/paveproject/pave/commit/a68468a9eef2bca743712a823cbebf089ed60b3f))
* **map:** offline-first incident reporting with PostGIS and TrueSheet ([80edf71](https://github.com/paveproject/pave/commit/80edf71f558c8df90565116ddcfac5b096e03d0a))
* **mobile:** switch realtime to native WebSocket, drop socket.io ([3aface9](https://github.com/paveproject/pave/commit/3aface986c7b9f3e170f7899b2a7d7c77d96b1e7))
* **notify:** send real FCM/APNs push notifications ([d26243b](https://github.com/paveproject/pave/commit/d26243b1340b6a1a399d82ea655fa597973a4719))
* **push:** send real FCM/APNs push notifications from notify ([147ec48](https://github.com/paveproject/pave/commit/147ec48a4e722ee335c388cbdd3cd9bd9c1e76fb))


### Bug Fixes

* clear pre-existing lint errors blocking affected mobile/db/query-client ([75b2fb8](https://github.com/paveproject/pave/commit/75b2fb8970baec25e9fb8889a57b221350084008))
* **mobile:** add missing JSON import attribute in app.config.ts ([e725142](https://github.com/paveproject/pave/commit/e72514298c45d739e811bd51e443e5a27f9fffe5))
* **mobile:** bundle identifier org.pave.app -&gt; org.paveproject.app ([b1d4b93](https://github.com/paveproject/pave/commit/b1d4b937577632f32b094c348ae616c56ba5ec74))
* **mobile:** import type for ExpoConfig/ConfigContext in app.config.ts ([86fee37](https://github.com/paveproject/pave/commit/86fee375e656d8f734b8c9ff14924a284e09d20d))
* **mobile:** offline-first language sync with backend ([d35feb2](https://github.com/paveproject/pave/commit/d35feb2d062f0ce688db43ff98bb95c800c5900c))
* **mobile:** rename constants/Colors.ts and Assets.ts to match their imports ([bd82851](https://github.com/paveproject/pave/commit/bd82851a780b608db8e32102b86ef190489630d3))
* **mobile:** self-heal invalid persisted locale value ([9d4e0bb](https://github.com/paveproject/pave/commit/9d4e0bbe6c156e9e8f4931832651c5e72faa48d9))
* **mobile:** stale username-availability cache, debounced check, input focus loss ([75d77ab](https://github.com/paveproject/pave/commit/75d77ab11196a8ef0ea1f3cea477e40dd05a26dc))
* **mobile:** theme preference system, misc UI and copy fixes ([696d540](https://github.com/paveproject/pave/commit/696d54028d1529ed1a03f3fe83c63e9f6cace390))
