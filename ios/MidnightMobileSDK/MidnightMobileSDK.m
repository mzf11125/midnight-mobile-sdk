//
//  MidnightMobileSDK.m
//  MidnightMobileSDK
//
//  Created by Midnight SDK Team
//  Copyright © 2025 dedanzi. All rights reserved.
//

#import "MidnightMobileSDK.h"
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>

@implementation MidnightMobileSDK {
  LAContext *authContext;
  NSMutableDictionary *walletStore;
}

RCT_EXPORT_MODULE(MidnightMobileSDK);

- (instancetype)init {
  if (self = [super init]) {
    authContext = [[LAContext alloc] init];
    walletStore = [[NSMutableDictionary alloc] init];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"onDeepLink",
    @"onWalletCreated",
    @"onWalletLocked",
    @"onBiometricStatusChange",
  ];
}

#pragma mark - Wallet Management

RCT_EXPORT_METHOD(createWallet:(NSString *)network
                  requireBiometrics:(BOOL)requireBiometrics
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    // Generate new mnemonic (would use BIP39 in production)
    NSString *mnemonic = [self generateMnemonic];

    // Store wallet info
    NSDictionary *walletInfo = @{
      @"mnemonic": mnemonic,
      @"network": network,
      @"requireBiometrics": @(requireBiometrics),
      @"createdAt": @(NSDate.date.timeIntervalSince1970 * 1000),
    };

    [walletStore setObject:walletInfo forKey:@"currentWallet"];

    resolve(@{
      @"address": [self deriveAddressFromMnemonic:mnemonic network:network],
      @"publicKey": [self derivePublicKeyFromMnemonic:mnemonic],
      @"network": network,
    });
  } @catch (NSException *exception) {
    reject(@"CREATE_WALLET_ERROR", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(importWallet:(NSString *)mnemonic
                  network:(NSString *)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    if (![self validateMnemonic:mnemonic]) {
      reject(@"INVALID_MNEMONIC", @"Invalid mnemonic phrase", nil);
      return;
    }

    NSDictionary *walletInfo = @{
      @"mnemonic": mnemonic,
      @"network": network,
      @"imported": @YES,
      @"createdAt": @(NSDate.date.timeIntervalSince1970 * 1000),
    };

    [walletStore setObject:walletInfo forKey:@"currentWallet"];

    resolve(@{
      @"address": [self deriveAddressFromMnemonic:mnemonic network:network],
      @"publicKey": [self derivePublicKeyFromMnemonic:mnemonic],
      @"network": network,
    });
  } @catch (NSException *exception) {
    reject(@"IMPORT_WALLET_ERROR", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(getWalletInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *walletInfo = [walletStore objectForKey:@"currentWallet"];

  if (!walletInfo) {
    reject(@"WALLET_NOT_FOUND", @"No wallet found", nil);
    return;
  }

  resolve(@{
    @"address": [self deriveAddressFromMnemonic:walletInfo[@"mnemonic"]
                                    network:walletInfo[@"network"]],
    @"publicKey": [self derivePublicKeyFromMnemonic:walletInfo[@"mnemonic"]],
    @"network": walletInfo[@"network"],
  });
}

RCT_EXPORT_METHOD(lockWallet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [walletStore removeObjectForKey:@"unlocked"];
  [self sendEventWithName:@"onWalletLocked" body:@{@"timestamp": @(NSDate.date.timeIntervalSince1970 * 1000)}];
  resolve(@{@"locked": @YES});
}

RCT_EXPORT_METHOD(unlockWallet:(BOOL)useBiometrics
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (useBiometrics) {
    [authContext evaluatePolicy:LAPolicyDeviceOwnerAuthentication
                localizedReason:@"Authenticate to unlock your wallet"
                          reply:^(BOOL success, NSError *error) {
      if (success) {
        [walletStore setObject:@YES forKey:@"unlocked"];
        resolve(@{@"unlocked": @YES});
      } else {
        reject(@"BIOMETRIC_FAILED", error.localizedDescription, error);
      }
    }];
  } else {
    [walletStore setObject:@YES forKey:@"unlocked"];
    resolve(@{@"unlocked": @YES});
  }
}

RCT_EXPORT_METHOD(wipeWallet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [walletStore removeAllObjects];
  resolve(@{@"wiped": @YES});
}

#pragma mark - Biometric Authentication

RCT_EXPORT_METHOD(authenticateBiometric:(NSString *)prompt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if ([authContext canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&error]) {
    [authContext evaluatePolicy:LAPolicyDeviceOwnerAuthentication
                localizedReason:prompt
                          reply:^(BOOL success, NSError *error) {
      if (success) {
        resolve(@{@"success": @YES});
      } else {
        reject(@"AUTH_FAILED", error.localizedDescription, error);
      }
    }];
  } else {
    reject(@"BIOMETRIC_UNAVAILABLE", error.localizedDescription, error);
  }
}

RCT_EXPORT_METHOD(checkBiometricCapability:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  BOOL available = [authContext canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&error];

  LABiometricType type = authContext.biometryType;
  NSString *biometricType = @"none";

  if (type == LABiometryTypeFaceID) {
    biometricType = @"face";
  } else if (type == LABiometryTypeTouchID) {
    biometricType = @"fingerprint";
  }

  resolve(@{
    @"available": @(available),
    @"enrolled": @(available),
    @"biometricType": biometricType,
  });
}

#pragma mark - Deep Links

RCT_EXPORT_METHOD(handleDeepLink:(NSString *)url
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self sendEventWithName:@"onDeepLink" body:@{@"url": url}];
  resolve(@{@"handled": @YES});
}

RCT_EXPORT_METHOD(generateDeepLink:(NSString *)type
                  params:(NSDictionary *)params
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSMutableString *url = [NSMutableString stringWithFormat:@"midnight://%@", type];

  if (params && params.count > 0) {
    [url appendString:@"?"];

    NSMutableArray *queryParts = [NSMutableArray array];
    for (NSString *key in params) {
      NSString *value = params[key];
      NSString *encoded = [self urlEncode:value];
      [queryParts addObject:[NSString stringWithFormat:@"%@=%@", key, encoded]];
    }

    [url appendString:[queryParts componentsJoinedByString:@"&"]];
  }

  resolve(@{@"url": url});
}

#pragma mark - Secure Storage

RCT_EXPORT_METHOD(secureSetItem:(NSString *)key
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *attributes = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrAccount: key,
    (__bridge id)kSecValueData: [value dataUsingEncoding:NSUTF8StringEncoding],
    (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
  };

  SecItemDelete((__bridge CFDictionaryRef)attributes);

  OSStatus status = SecItemAdd((__bridge CFDictionaryRef)attributes, NULL);

  if (status == errSecSuccess) {
    resolve(@{@"success": @YES});
  } else {
    reject(@"SECURE_STORE_ERROR", @"Failed to store item securely", nil);
  }
}

RCT_EXPORT_METHOD(secureGetItem:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *query = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrAccount: key,
    (__bridge id)kSecReturnData: @YES,
  };

  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);

  if (status == errSecSuccess) {
    NSData *data = (__bridge_transfer NSData *)result;
    NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    resolve(@{@"value": value});
  } else if (status == errSecItemNotFound) {
    resolve(@{@"value": (NSString *)[NSNull null]});
  } else {
    reject(@"SECURE_STORE_ERROR", @"Failed to retrieve item", nil);
  }
}

RCT_EXPORT_METHOD(secureDeleteItem:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *query = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrAccount: key,
  };

  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);

  if (status == errSecSuccess || status == errSecItemNotFound) {
    resolve(@{@"success": @YES});
  } else {
    reject(@"SECURE_STORE_ERROR", @"Failed to delete item", nil);
  }
}

#pragma mark - Helper Methods

- (NSString *)generateMnemonic {
  // Placeholder - would use BIP39 in production
  NSArray *words = @[
    @"abandon", @"ability", @"able", @"about", @"above", @"absent", @"absorb", @"abstract",
    @"absurd", @"abuse", @"access", @"accident", @"account", @"accuse", @"achieve", @"acid"
  ];

  NSMutableArray *mnemonic = [NSMutableArray array];
  for (int i = 0; i < 12; i++) {
    int index = arc4random_uniform((uint32_t)words.count);
    [mnemonic addObject:words[index]];
  }

  return [mnemonic componentsJoinedByString:@" "];
}

- (BOOL)validateMnemonic:(NSString *)mnemonic {
  NSArray *words = [mnemonic componentsSeparatedByString:@" "];
  return words.count == 12 || words.count == 24;
}

- (NSString *)deriveAddressFromMnemonic:(NSString *)mnemonic network:(NSString *)network {
  // Placeholder - actual implementation would use BIP-32/44 derivation
  NSString *prefix = [network isEqualToString:@"mainnet"] ? @"mid" :
                     [network isEqualToString:@"preprod"] ? @"ppmid" : @"tmid";

  // Create a mock address from mnemonic hash
  NSData *data = [mnemonic dataUsingEncoding:NSUTF8StringEncoding];
  uint8_t hash[20];
  CC_SHA256(data.bytes, (CC_LONG)data.length, hash);

  NSString *hashStr = [self dataToHexString:[NSData dataWithBytes:hash length:20]];
  return [NSString stringWithFormat:@"%@1%@", prefix, [hashStr substringToIndex:40]];
}

- (NSString *)derivePublicKeyFromMnemonic:(NSString *)mnemonic {
  // Placeholder - actual implementation would use HD key derivation
  NSData *data = [mnemonic dataUsingEncoding:NSUTF8StringEncoding];
  uint8_t hash[32];
  CC_SHA256(data.bytes, (CC_LONG)data.length, hash);
  return [self dataToHexString:[NSData dataWithBytes:hash length:32]];
}

- (NSString *)dataToHexString:(NSData *)data {
  const unsigned char *bytes = (const unsigned char *)data.bytes;
  NSMutableString *hex = [NSMutableString new];
  for (NSUInteger i = 0; i < data.length; i++) {
    [hex appendFormat:@"%02x", bytes[i]];
  }
  return hex;
}

- (NSString *)urlEncode:(NSString *)string {
  return [string stringByAddingPercentEncodingWithAllowedCharacters:
          [NSCharacterSet URLQueryAllowedCharacterSet]];
}

@end
