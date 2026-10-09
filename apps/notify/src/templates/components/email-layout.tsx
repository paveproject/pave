import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Hr,
  Text,
} from '@react-email/components';
import { assetPaths, assetUrl } from '@libs/assets';
import { env } from '../../env';

const colors = {
  background: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
  text: '#18181b',
  muted: '#71717a',
  brand: '#0b0909',
};

const logoUrl = assetUrl(assetPaths.app.icon, env.ASSETS_BASE_URL);

interface EmailLayoutProps {
  preview: string;
  locale?: string;
  children: React.ReactNode;
}

export const EmailLayout = ({ preview, locale = 'en', children }: EmailLayoutProps) => {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Img src={logoUrl} width="40" height="40" alt="Pavé" style={styles.logo} />
          </Section>

          <Section style={styles.card}>{children}</Section>

          <Hr style={styles.hr} />

          <Text style={styles.footer}>
            © {new Date().getFullYear()} Pavé. This email was sent to you because you have an
            account on Pavé.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: colors.background,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: 0,
    padding: '32px 12px',
  },
  container: {
    maxWidth: '480px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    padding: '8px 0 24px',
  },
  logo: {
    borderRadius: '10px',
    margin: '0 auto',
  },
  card: {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '32px',
  },
  hr: {
    borderColor: colors.border,
    margin: '24px 0 16px',
  },
  footer: {
    color: colors.muted,
    fontSize: '12px',
    lineHeight: '18px',
    textAlign: 'center',
    padding: '0 16px',
  },
};

export const emailColors = colors;
