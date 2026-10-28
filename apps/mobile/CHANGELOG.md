# Changelog

## [0.0.2](https://github.com/paveproject/pave/compare/mobile@v0.0.1...mobile@v0.0.2) (2026-10-28)


### Features

* **api,mobile:** check minimum supported app version on launch ([4b51839](https://github.com/paveproject/pave/commit/4b51839271ef2e00f4e2c21f971e1c9196abf256))
* **api,mobile:** configurable recovery delay + protest mode ([2b3e5b2](https://github.com/paveproject/pave/commit/2b3e5b2271828b47bddd8e1e68f64047040bab8a))
* **api,mobile:** protest-mode position + audio recording ([3664d23](https://github.com/paveproject/pave/commit/3664d23fb878e2f900f1bcd4cba738386a517531))
* **api,mobile:** username onboarding, route review, S3 test coverage ([8324ddf](https://github.com/paveproject/pave/commit/8324ddf4894d83c4e605f24846ffb3917499163d))
* **auth:** switch to OTP-only sign-in, add avatar and push-token endpoints ([e041f2c](https://github.com/paveproject/pave/commit/e041f2cde6fd9f528d489b9142a75c0d382f2ea5))
* check minimum supported app version on launch ([a68468a](https://github.com/paveproject/pave/commit/a68468a9eef2bca743712a823cbebf089ed60b3f))
* **map:** offline-first incident reporting with PostGIS and TrueSheet ([80edf71](https://github.com/paveproject/pave/commit/80edf71f558c8df90565116ddcfac5b096e03d0a))
* **mobile:** BLE mesh relay for offline reports ([92148b3](https://github.com/paveproject/pave/commit/92148b3b757beb84635216e71e3074a41fa6782b))
* **mobile:** map renders local/mesh-pending reports alongside server ones ([795275d](https://github.com/paveproject/pave/commit/795275d81f994cb9fe79943d8132511af149857e))
* **mobile:** mirror server-side report grouping for local/mesh reports ([3a8e0d2](https://github.com/paveproject/pave/commit/3a8e0d20052a274522cfed2fafe8e6a802fd4ed8))
* **mobile:** pick a family before a report type ([f910113](https://github.com/paveproject/pave/commit/f9101134c50b62caf3b9ae25016eb595517b3310))
* **mobile:** recovery phrase flow, unified sync tasks; remove protest-mode ([a2ac353](https://github.com/paveproject/pave/commit/a2ac353c4136bae80eb13a816ab4aa21a8b20f52))
* **mobile:** soft-3D report icons, bundled and OTA-updatable ([a994146](https://github.com/paveproject/pave/commit/a994146106e4d8ca1860591185f698f13c583c73))
* **mobile:** switch realtime to native WebSocket, drop socket.io ([3aface9](https://github.com/paveproject/pave/commit/3aface986c7b9f3e170f7899b2a7d7c77d96b1e7))
* **mobile:** unified permissions system + onboarding permissions screen ([a5c4efd](https://github.com/paveproject/pave/commit/a5c4efdaf36f646e31295840b2a953590f6b682f))
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
* **mobile:** fall back to borderedProminent below iOS 26 for filled buttons ([150fa5c](https://github.com/paveproject/pave/commit/150fa5c1d352e187fb65c407c1ab87bc979391ae))
* **mobile:** give the light splash a light background ([fc38ae4](https://github.com/paveproject/pave/commit/fc38ae4a643a86e15e76390d44c8b5defcd12d1f))
* **mobile:** import type for ExpoConfig/ConfigContext in app.config.ts ([86fee37](https://github.com/paveproject/pave/commit/86fee375e656d8f734b8c9ff14924a284e09d20d))
* **mobile:** offline-first language sync with backend ([d35feb2](https://github.com/paveproject/pave/commit/d35feb2d062f0ce688db43ff98bb95c800c5900c))
* **mobile:** opaque header on the add-trusted-contact formSheet ([b6c7730](https://github.com/paveproject/pave/commit/b6c7730f8ac468d010c5e38bcf94eb47dff2c1c6))
* **mobile:** propagate forced color scheme to Compose, add shared NativeButton/useThemes ([25dc2c6](https://github.com/paveproject/pave/commit/25dc2c60556d561a9547a37d2ace29d39eaa23a6))
* **mobile:** recovery-phrase checkbox never visibly checked on welcome ([9a83afa](https://github.com/paveproject/pave/commit/9a83afaef1435488cf42d399dec63ed6eef80189))
* **mobile:** relay mesh packets whose report type this build can't decode ([355c353](https://github.com/paveproject/pave/commit/355c35345252b073113daec8ce87cf7e932cd5f3))
* **mobile:** rename constants/Colors.ts and Assets.ts to match their imports ([bd82851](https://github.com/paveproject/pave/commit/bd82851a780b608db8e32102b86ef190489630d3))
* **mobile:** render report icons at a map size and a UI size ([086f458](https://github.com/paveproject/pave/commit/086f45892e8924cf347383be33acb138062b981e))
* **mobile:** restore pager-view/tab-view, bump Android compileSdk to 37 ([93fa358](https://github.com/paveproject/pave/commit/93fa35834c2f86dd63258801a736ddfce919ab4e))
* **mobile:** self-heal invalid persisted locale value ([9d4e0bb](https://github.com/paveproject/pave/commit/9d4e0bbe6c156e9e8f4931832651c5e72faa48d9))
* **mobile:** set real ascAppId in eas.json ([4fb5443](https://github.com/paveproject/pave/commit/4fb5443260a1595f0673e7841d5c859dd59f1211))
* **mobile:** size markers to the 512px sprites, and stop clustering reports ([fb0dc27](https://github.com/paveproject/pave/commit/fb0dc27ba84272974acbc4bb630f6f9797cdc78f))
* **mobile:** stale username-availability cache, debounced check, input focus loss ([75d77ab](https://github.com/paveproject/pave/commit/75d77ab11196a8ef0ea1f3cea477e40dd05a26dc))
* **mobile:** stop the settings avatar from eating its row ([9a92bba](https://github.com/paveproject/pave/commit/9a92bbaad11e25657fc62226816eacb4f8ab8916))
* **mobile:** switch.tsx lost its @expo/ui rewrite during the rename ([2f4ec73](https://github.com/paveproject/pave/commit/2f4ec73db2547afd7799b6def76cfce6912b39f9))
* **mobile:** theme preference system, misc UI and copy fixes ([696d540](https://github.com/paveproject/pave/commit/696d54028d1529ed1a03f3fe83c63e9f6cace390))
* **mobile:** tint the modal header with the theme foreground ([9739cde](https://github.com/paveproject/pave/commit/9739cdedd7e4c31372f339344079447b890a4e0a))


### Performance Improvements

* **mobile:** group local and mesh reports the way the API does ([1a855e7](https://github.com/paveproject/pave/commit/1a855e7bbfc7101fc07f5193765cc189037f477b))
* **mobile:** keep the map usable over a clustered live feed ([1c3ef7c](https://github.com/paveproject/pave/commit/1c3ef7cf99b1464aedb1b89811cf5b82f0cdab08))
