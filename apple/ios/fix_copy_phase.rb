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

puts "Current build phases:"
watch_target.build_phases.each do |phase|
  puts "  - #{phase.class.name}: #{phase.display_name || 'Unnamed'}"
end

# Remove all Copy Files build phases
watch_target.build_phases.to_a.each do |phase|
  if phase.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
    puts "Removing Copy Files phase: #{phase.display_name}"
    phase.remove_from_project
  end
end

# Also set the new build system setting to avoid this
watch_target.build_configurations.each do |config|
  config.build_settings['VALIDATE_WORKSPACE'] = 'YES'
  config.build_settings['EXCLUDED_ARCHS[sdk=watchsimulator*]'] = ''
end

# Save the project
project.save

puts "\n🎉 Removed Copy Files build phases!"
