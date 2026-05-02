/**
 * Shared invite helper — shows a WhatsApp / SMS / Email action sheet
 * and dispatches the message through whichever channel the user picks.
 */
import { Alert, Linking, Platform } from 'react-native';
import * as SMS from 'expo-sms';

export const INVITE_MESSAGE = (firstName: string) =>
  `Hey ${firstName}! I'm using SplitPay to split expenses with friends. Join me — it's free! 🤝`;

export async function sendInvite(contact: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<void> {
  const firstName = contact.name.split(' ')[0];
  const msg = INVITE_MESSAGE(firstName);

  const hasPhone = !!contact.phone;
  const hasEmail = !!contact.email;

  if (!hasPhone && !hasEmail) {
    Alert.alert('No contact info', `${contact.name} has no phone number or email address.`);
    return;
  }

  type Btn = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };
  const buttons: Btn[] = [];

  // ── WhatsApp ────────────────────────────────────────────────────────────────
  // Always show WhatsApp when there's a phone number.
  // canOpenURL is unreliable in Expo Go; if WhatsApp isn't installed the OS
  // shows its own "app not found" dialog.
  if (hasPhone) {
    buttons.push({
      text: 'WhatsApp',
      onPress: () => {
        const digits = contact.phone!.replace(/\D/g, '');
        Linking.openURL(
          `whatsapp://send?phone=${digits}&text=${encodeURIComponent(msg)}`,
        ).catch(() =>
          Alert.alert('WhatsApp not found', 'Please install WhatsApp and try again.'),
        );
      },
    });
  }

  // ── SMS ─────────────────────────────────────────────────────────────────────
  if (hasPhone) {
    buttons.push({
      text: 'SMS',
      onPress: async () => {
        const available = await SMS.isAvailableAsync().catch(() => false);
        if (available) {
          SMS.sendSMSAsync([contact.phone!], msg);
        } else {
          const sep = Platform.OS === 'ios' ? '&' : '?';
          Linking.openURL(
            `sms:${contact.phone}${sep}body=${encodeURIComponent(msg)}`,
          );
        }
      },
    });
  }

  // ── Email ───────────────────────────────────────────────────────────────────
  if (hasEmail) {
    buttons.push({
      text: 'Email',
      onPress: () =>
        Linking.openURL(
          `mailto:${contact.email}` +
          `?subject=${encodeURIComponent('Join me on SplitPay!')}` +
          `&body=${encodeURIComponent(msg)}`,
        ),
    });
  }

  buttons.push({ text: 'Cancel', style: 'cancel' });

  const subtitle = hasPhone && hasEmail
    ? 'Send via WhatsApp, SMS, or Email:'
    : hasPhone
    ? 'Send via WhatsApp or SMS:'
    : 'Send via Email:';

  Alert.alert(`Invite ${contact.name}`, subtitle, buttons);
}
