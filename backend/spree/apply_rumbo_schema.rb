# frozen_string_literal: true

schema_path = "/opt/rumbo/db/010_rumbo_core.sql"

unless File.file?(schema_path)
  abort("Rumbo schema not found at #{schema_path}")
end

ActiveRecord::Base.connection.raw_connection.exec(File.read(schema_path))
puts "Rumbo database schema is up to date."
