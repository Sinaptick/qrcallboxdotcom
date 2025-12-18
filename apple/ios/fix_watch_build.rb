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

# Get the QRCallWatch group
watch_group = project.main_group.find_subpath('QRCallWatch', false)

# Remove Info.plist from Copy Bundle Resources phase
info_plist_ref = watch_group.files.find { |f| f.path == 'Info.plist' }
if info_plist_ref
  watch_target.resources_build_phase.files.each do |build_file|
    if build_file.file_ref == info_plist_ref
      build_file.remove_from_project
      puts "✅ Removed Info.plist from Copy Bundle Resources"
    end
  end
end

# Set the correct build settings
watch_target.build_configurations.each do |config|
  config.build_settings['INFOPLIST_FILE'] = 'QRCallWatch/Info.plist'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.stable.qrcallbox.watchkitapp'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '4'
  config.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
  config.build_settings['SDKROOT'] = 'watchos'
  config.build_settings['SKIP_INSTALL'] = 'NO'
  config.build_settings['ENABLE_PREVIEWS'] = 'YES'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  puts "✅ Updated #{config.name} settings"
end

# Save the project
project.save

puts "\n🎉 Fixed watchOS build configuration!"
