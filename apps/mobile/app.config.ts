import type { ExpoConfig, ConfigContext } from 'expo/config';
import packageInfo from './package.json' with { type: 'json' };

const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

const getUniqueIdentifier = () => {
  return 'org.paveproject.app';
};

const getAppName = () => {
  if (IS_DEV) {
    return 'Pavé (Dev)';
  }

  if (IS_PREVIEW) {
    return 'Pavé (Preview)';
  }

  return 'Pavé';
};

const getWebDomain = () => {
  return process.env.EXPO_PUBLIC_WEB_APP;
};

const getGoogleServicesFilePath = () => {
  return process.env.GOOGLE_SERVICES_JSON || './google-services.json';
};

const getGoogleServiceInfoFile = () => {
  return process.env.GOOGLE_SERVICE_INFO_PLIST || './GoogleService-Info.plist';
};

const getGoogleIosUrlScheme = () => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!clientId) return undefined;
  return `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;
};

const getProjectId = () => {
  return '76ddc538-662f-49ee-9b33-db2f6a419d9b';
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: getAppName(),
  slug: 'pave',
  platforms: ['ios', 'android'],
  version: packageInfo.version,
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    checkAutomatically: 'ON_LOAD',
    url: `https://u.expo.dev/${getProjectId()}`,
  },
  orientation: 'portrait',
  icon: './src/assets/images/app/icons/icon.png',
  scheme: 'pave',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    googleServicesFile: getGoogleServiceInfoFile(),
    bundleIdentifier: getUniqueIdentifier(),
    appleTeamId: 'G87KW7348W',
    associatedDomains: [`applinks:${getWebDomain()}`],
    icon: {
      light: './src/assets/images/app/icons/icon-light.png',
      dark: './src/assets/images/app/icons/icon-dark.png',
      tinted: './src/assets/images/app/icons/icon-tinted.png',
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // UIDesignRequiresCompatibility: true, // Disable iOS 26 Liquid Glass effect
      NSLocationWhenInUseUsageDescription:
        'Your location is used to show relevant content based on where you are.',
      NSCameraUsageDescription:
        'The camera is used to upload profile pictures, playlist covers, story background images, and to scan trusted-contact codes.',
      NSPhotoLibraryUsageDescription:
        'Photos are used to select profile images, playlist covers, and shared story backgrounds.',
    },
    usesAppleSignIn: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './src/assets/images/app/icons/adaptive-icon.png',
      monochromeImage: './src/assets/images/app/icons/adaptive-icon-monochrome.png',
      backgroundColor: '#0b0909',
    },
    package: getUniqueIdentifier(),
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: getWebDomain(),
            pathPrefix: '/',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.INTERNET'],
    blockedPermissions: ['com.google.android.gms.permission.AD_ID'],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || getGoogleServicesFilePath(),
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './src/assets/images/app/icons/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-video',
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.4',
          useFrameworks: 'static',
          enableSceneSupport: true,
        },
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Select images to upload profile pictures, playlist covers, and story backgrounds.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'The camera is used to upload profile pictures, playlist covers, story background images, and to scan trusted-contact codes.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    'expo-secure-store',
    [
      'expo-notifications',
      {
        sounds: ['./src/assets/sounds/notif.wav'],
      },
    ],
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './src/assets/images/app/splash/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#0b0909',
        dark: {
          image: './src/assets/images/app/splash/splash-icon-dark.png',
          backgroundColor: '#0b0909',
        },
      },
    ],
    [
      'react-native-share',
      {
        ios: ['fb', 'fb-messenger', 'instagram', 'twitter', 'tiktoksharesdk', 'whatsapp'],
        android: [
          'com.facebook.katana',
          'com.facebook.orca',
          'com.instagram.android',
          'com.twitter.android',
          'com.zhiliaoapp.musically',
          'com.whatsapp',
        ],
        enableBase64ShareAndroid: true,
      },
    ],
    ...(getGoogleIosUrlScheme()
      ? [
          [
            '@react-native-google-signin/google-signin',
            {
              iosUrlScheme: getGoogleIosUrlScheme(),
            },
          ],
        ]
      : []),
    ['expo-apple-authentication'],
    [
      'expo-asset',
      {
        assets: ['./src/assets/images/map/reports/'],
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: process.env.SENTRY_PROJECT,
        organization: process.env.SENTRY_ORG,
      },
    ],
    '@maplibre/maplibre-react-native',
    '@lovesworking/watermelondb-expo-plugin-sdk-52-plus',
    [
      'expo-media-library',
      {
        photosPermission: 'Allow $(PRODUCT_NAME) to access your photos.',
        savePhotosPermission: 'Allow $(PRODUCT_NAME) to save photos.',
        isAccessMediaLocationEnabled: true,
        granularPermissions: ['audio', 'photo'],
      },
    ],
    [
      'expo-document-picker',
      {
        filePermission: 'Select files to upload',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    webDomain: getWebDomain(),
    router: {
      origin: false,
    },
    eas: {
      projectId: getProjectId(),
    },
  },
  owner: 'lxup',
});
