#!/usr/bin/env ruby

require 'xcodeproj'

# Open the Xcode project
project_path = 'Runner.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the watch target
watch_target = project.targets.find { |t| t.name == 'QRCallWatch' }

unless watch_target
  puts "❌ QRCallWatch target not found"
  exit 1
end

# Set build settings to avoid the CopyAndPreserveArchs issue
watch_target.build_configurations.each do |config|
  # Only build active architecture for simulator
  config.build_settings['ONLY_ACTIVE_ARCH'] = 'YES'

  # Disable bitcode for watchOS
  config.build_settings['ENABLE_BITCODE'] = 'NO'

  # Set the correct product type
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.stable.qrcallbox.watchkitapp'
  config.build_settings['SDKROOT'] = 'watchos'
  config.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '4'
  config.build_settings['INFOPLIST_FILE'] = 'QRCallWatch/Info.plist'

  # Disable the problematic preserve archs
  config.build_settings['ARCHS'] = '$(ARCHS_STANDARD)'
  config.build_settings['VALID_ARCHS'] = 'arm64'

  puts "✅ Updated #{config.name} settings"
end

# Explicitly set the product type
watch_target.product_type = 'com.apple.product-type.application.watchapp2'

# Save the project
project.save

puts "\n🎉 Applied final fix - should build now!"
