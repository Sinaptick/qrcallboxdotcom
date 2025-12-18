#!/usr/bin/env ruby

require 'xcodeproj'

# Open the Xcode project
project_path = 'Runner.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
main_target = project.targets.find { |t| t.name == 'Runner' }

# Create watchOS target
watch_target = project.new_target(:watch2_app, 'QRCallWatch', :watchos, '9.0')

puts "✅ Created watchOS target: #{watch_target.name}"

# Configure watch target settings
watch_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.stable.qrcallbox.watchkitapp'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '4'
  config.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
  config.build_settings['SDKROOT'] = 'watchos'
  config.build_settings['INFOPLIST_FILE'] = 'QRCallWatch/Info.plist'
  config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  config.build_settings['ENABLE_PREVIEWS'] = 'YES'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks'
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
end

# Get or create the QRCallWatch group
watch_group = project.main_group.find_subpath('QRCallWatch', true)
watch_group.set_source_tree('SOURCE_ROOT')

# Add files to the target
files_to_add = [
  'QRCallWatch/QRCallWatchApp.swift',
  'QRCallWatch/ContentView.swift',
  'QRCallWatch/FirebaseService.swift',
  'QRCallWatch/NotificationService.swift',
  'QRCallWatch/WatchConnectivityManager.swift',
  'QRCallWatch/ScanRequest.swift',
  'QRCallWatch/Info.plist',
  'QRCallWatch/GoogleService-Info.plist'
]

files_to_add.each do |file_path|
  if File.exist?(file_path)
    file_ref = watch_group.new_reference(file_path)

    # Add swift files to compile phase
    if file_path.end_with?('.swift')
      watch_target.source_build_phase.add_file_reference(file_ref)
      puts "  ✅ Added Swift file: #{file_path}"
    # Add plist files to resources
    elsif file_path.end_with?('.plist')
      watch_target.resources_build_phase.add_file_reference(file_ref)
      puts "  ✅ Added plist: #{file_path}"
    end
  else
    puts "  ⚠️  File not found: #{file_path}"
  end
end

# Add Assets.xcassets
if Dir.exist?('QRCallWatch/Assets.xcassets')
  assets_ref = watch_group.new_reference('QRCallWatch/Assets.xcassets')
  watch_target.resources_build_phase.add_file_reference(assets_ref)
  puts "  ✅ Added Assets.xcassets"
end

# Set the watch app to embed in the iOS app
watch_target.build_settings('Debug')['SKIP_INSTALL'] = 'NO'
watch_target.build_settings('Release')['SKIP_INSTALL'] = 'NO'

# Save the project
project.save

puts "\n🎉 Successfully added watchOS target to the project!"
puts "📋 Next steps:"
puts "  1. Run: pod install"
puts "  2. Open: Runner.xcworkspace"
puts "  3. Build and run the QRCallWatch scheme"
