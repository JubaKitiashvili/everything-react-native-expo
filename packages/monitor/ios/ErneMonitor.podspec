require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ErneMonitor'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = 'https://github.com/erne-dev/erne'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/erne-dev/erne.git', tag: "monitor-#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift, Objective-C, and the C signal handler shim live next to each other.
  # CocoaPods auto-generates an umbrella header from `public_header_files`,
  # which Swift inside the same pod can use directly — no custom modulemap.
  s.source_files = '**/*.{h,m,mm,swift,c}'
  s.exclude_files = 'generated/placeholder-*.swift'
  s.public_header_files = 'SignalHandler.h'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'CLANG_ENABLE_MODULES' => 'YES'
  }
end
