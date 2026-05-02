/**
 * AdBanner — pure-JS placeholder in Expo Go / dev,
 * real AdMob BannerAd in a production native build.
 *
 * To activate real ads:
 *  1. Build with EAS (eas build --platform ios)
 *  2. Replace AD_UNIT_ID below with your real unit ID
 *  3. Remove the Constants.appOwnership check to enable live ads
 */
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

// Only load AdMob in a standalone/native build, never in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;

if (!isExpoGo) {
  try {
    const admob = require('react-native-google-mobile-ads');
    BannerAd     = admob.BannerAd;
    BannerAdSize = admob.BannerAdSize;
    TestIds      = admob.TestIds;
  } catch (_) { /* native module missing */ }
}

const AD_UNIT_ID = __DEV__
  ? 'ca-app-pub-3940256099942544/2934735716'   // Google test banner ID
  : 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';  // ← your real unit ID

export default function AdBanner() {
  if (!BannerAd) {
    // Pure JS placeholder — safe in Expo Go and any env without native AdMob
    return (
      <View style={s.placeholder}>
        <Text style={s.placeholderText}>Advertisement</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <BannerAd
        unitId={AD_UNIT_ID}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:       { alignItems: 'center', marginVertical: 8 },
  placeholder:     { height: 50, marginHorizontal: 16, marginVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed' },
  placeholderText: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
});
