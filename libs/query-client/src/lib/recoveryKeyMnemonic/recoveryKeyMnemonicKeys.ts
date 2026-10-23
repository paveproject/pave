export const recoveryKeyMnemonicKeys = {
  base: 'recovery-key-mnemonic' as const,

  /** One blob per account, no params needed. */
  detail: () => [recoveryKeyMnemonicKeys.base] as const,
};
