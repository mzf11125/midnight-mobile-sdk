Pod::Spec.new do |s|
  s.name           = 'MidnightMobileSDK'
  s.version        = '0.1.0'
  s.summary        = 'React Native SDK for Midnight Network'
  s.description    = <<-DESC
    A React Native SDK for Midnight Network that provides mobile wallet functionality,
    contract deployment/calling with zero-knowledge proof delegation, and DApp connectivity
    through deep links and QR codes.
  DESC

  s.homepage       = 'https://github.com/dedanzi/midnight-mobile-sdk'
  s.license        = { :type => 'MIT', :file => 'LICENSE' }
  s.author         = { 'dedanzi' => 'npm@dedanzi.com' }
  s.platforms      = { :ios => '13.0' }
  s.source         = { :git => 'https://github.com/dedanzi/midnight-mobile-sdk.git', :tag => "v#{s.version}" }

  s.source_files   = 'MidnightMobileSDK/**/*.{h,m,mm,swift}'
  s.requires_arc   = true

  s.dependency 'React-Core'
  s.dependency 'React-RCTAppDelegate'

  # Keychain/Security
  s.frameworks     = 'LocalAuthentication', 'Security'

  # Optional dependencies
  s.subspec 'Camera' do |camera|
    camera.dependency 'React-NativeVisionCamera'
  end

  s.subspec 'SecureStore' do |ss|
    ss.dependency 'EXSecureStore'
  end

  s.subspec 'LocalAuthentication' do |la|
    la.dependency 'EXLocalAuthentication'
  end
end
