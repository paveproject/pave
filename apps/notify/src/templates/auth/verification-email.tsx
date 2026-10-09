import * as React from 'react';
import { Button, Text, Heading } from '@react-email/components';
import { EmailLayout, emailColors } from '../components/email-layout';

interface VerificationEmailProps {
  url?: string;
  locale?: string;
  dictionary: {
    title: string;
    text: string;
    button: string;
  };
}

export const VerificationEmail = ({ url, dictionary, locale = 'en' }: VerificationEmailProps) => {
  return (
    <EmailLayout preview={dictionary.title} locale={locale}>
      <Heading style={styles.heading}>{dictionary.title}</Heading>
      <Text style={styles.text}>{dictionary.text}</Text>
      {url ? (
        <Button href={url} style={styles.button}>
          {dictionary.button}
        </Button>
      ) : null}
    </EmailLayout>
  );
};

const styles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: '20px',
    lineHeight: '28px',
    color: emailColors.text,
    margin: '0 0 12px',
  },
  text: {
    fontSize: '14px',
    lineHeight: '22px',
    color: emailColors.text,
    margin: '0 0 24px',
  },
  button: {
    backgroundColor: emailColors.brand,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '8px',
    padding: '12px 20px',
    textDecoration: 'none',
    display: 'inline-block',
  },
};
