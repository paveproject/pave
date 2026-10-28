/**
 * Puts the accented app name back into Android's launcher label.
 *
 * `name` in app.config.ts has to stay ASCII - see the comment there. iOS can
 * recover the accent through `CFBundleDisplayName`, which wins over `name`,
 * but Android takes `app_name` straight from `name` with no override field, so
 * the only way back is to write the string resource after Expo's own name
 * plugin has written the ASCII one.
 */
const { withStringsXml, AndroidConfig } = require('expo/config-plugins');

module.exports = (config, { name }) =>
  withStringsXml(config, (config) => {
    config.modResults = AndroidConfig.Strings.setStringItem(
      [
        AndroidConfig.Resources.buildResourceItem({
          name: 'app_name',
          value: name,
          translatable: false,
        }),
      ],
      config.modResults,
    );
    return config;
  });
