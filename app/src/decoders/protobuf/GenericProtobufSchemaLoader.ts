import * as protobuf from 'protobufjs'
import * as path from 'path'
import * as fs from 'fs'

export interface LoadedSchema {
  name: string
  type: protobuf.Type
  namespace: string
}

export class GenericProtobufSchemaLoader {
  private static instance: GenericProtobufSchemaLoader | undefined
  private root: protobuf.Root | undefined
  private loadedSchemas: LoadedSchema[] = []
  private schemaFolder: string | undefined
  private loadPromise: Promise<void> | undefined

  public static getInstance(): GenericProtobufSchemaLoader {
    if (!this.instance) {
      this.instance = new GenericProtobufSchemaLoader()
    }
    return this.instance
  }

  public setSchemaFolder(folderPath: string): void {
    if (this.schemaFolder !== folderPath) {
      this.schemaFolder = folderPath
      this.root = undefined
      this.loadedSchemas = []
      this.loadPromise = undefined
      console.log('[GenericProtobufSchemaLoader] Schema folder changed to:', folderPath)
    }
  }

  public getSchemaFolder(): string | undefined {
    return this.schemaFolder
  }

  public async getLoadedSchemas(): Promise<LoadedSchema[]> {
    if (!this.schemaFolder) {
      return []
    }

    if (!this.loadPromise) {
      this.loadPromise = this.loadSchemas()
    }

    await this.loadPromise
    return this.loadedSchemas
  }

  private async loadSchemas(): Promise<void> {
    if (!this.schemaFolder) {
      console.log('[GenericProtobufSchemaLoader] No schema folder set')
      return
    }

    try {
      console.log('[GenericProtobufSchemaLoader] Starting schema load from:', this.schemaFolder)

      // Find all .proto files recursively
      const protoFiles = await this.findProtoFiles(this.schemaFolder)
      console.log('[GenericProtobufSchemaLoader] Found proto files:', protoFiles)

      if (protoFiles.length === 0) {
        console.log('[GenericProtobufSchemaLoader] No .proto files found')
        return
      }

      this.root = new protobuf.Root()

      // Set up path resolution for imports
      this.root.resolvePath = (origin: string, target: string) => {
        console.log('[GenericProtobufSchemaLoader] Resolving import:', target, 'from:', origin || 'root')

        // If target is already an absolute path (direct file load), return as-is
        if (path.isAbsolute(target)) {
          console.log('[GenericProtobufSchemaLoader] Target is absolute path, returning as-is')
          return target
        }

        // Skip Google well-known types - they cause HTTP requests we can't fulfill
        if (target.startsWith('google/protobuf/')) {
          console.log('[GenericProtobufSchemaLoader] Skipping Google well-known type:', target)
          throw new Error(`Skipping Google protobuf import: ${target}`)
        }

        // Try relative to origin file first
        if (origin && !path.isAbsolute(target)) {
          const originDir = path.dirname(origin)
          const resolved = path.resolve(originDir, target)
          if (fs.existsSync(resolved)) {
            console.log('[GenericProtobufSchemaLoader] Resolved relative to origin:', resolved)
            return resolved
          }
        }

        // Try relative to proto root folder (where all .proto files are organized)
        if (!path.isAbsolute(target)) {
          const protoRootDir = path.join(this.schemaFolder!, 'proto')
          const resolved = path.resolve(protoRootDir, target)
          if (fs.existsSync(resolved)) {
            console.log('[GenericProtobufSchemaLoader] Resolved relative to proto root:', resolved)
            return resolved
          }
        }

        // Try relative to schema folder as fallback
        if (!path.isAbsolute(target)) {
          const resolved = path.resolve(this.schemaFolder!, target)
          if (fs.existsSync(resolved)) {
            console.log('[GenericProtobufSchemaLoader] Resolved relative to schema folder:', resolved)
            return resolved
          }
        }

        // If we can't resolve it, don't return the original target as it might cause file:// URLs
        console.warn('[GenericProtobufSchemaLoader] Could not resolve import:', target)
        throw new Error(`Could not resolve import: ${target}`)
      }

      // Load files individually with better error handling
      for (const protoFile of protoFiles) {
        try {
          console.log(`[GenericProtobufSchemaLoader] Loading proto file: ${protoFile}`)
          await this.root.load(protoFile)
          console.log(`[GenericProtobufSchemaLoader] Successfully loaded: ${path.basename(protoFile)}`)
        } catch (error) {
          console.warn(`[GenericProtobufSchemaLoader] Failed to load ${path.basename(protoFile)}, skipping:`, error instanceof Error ? error.message : error)
          // Continue with other files even if one fails
        }
      }

      // Extract all message types from the loaded root
      this.extractMessageTypes(this.root)
      console.log('[GenericProtobufSchemaLoader] Extracted message types:', this.loadedSchemas.map(s => s.name))

    } catch (error) {
      console.warn('[GenericProtobufSchemaLoader] Failed to load protobuf schemas:', error)
      this.loadedSchemas = []
    }
  }

  private async findProtoFiles(dir: string): Promise<string[]> {
    const protoFiles: string[] = []

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.findProtoFiles(fullPath)
          protoFiles.push(...subFiles)
        } else if (entry.isFile() && entry.name.endsWith('.proto')) {
          protoFiles.push(fullPath)
        }
      }
    } catch (error) {
      console.warn('[GenericProtobufSchemaLoader] Error reading directory:', dir, error)
    }

    return protoFiles
  }

  private extractMessageTypes(namespace: protobuf.Namespace, prefix: string = ''): void {
    for (const [name, nested] of Object.entries(namespace.nested || {})) {
      const fullName = prefix ? `${prefix}.${name}` : name

      if (nested instanceof protobuf.Type) {
        // This is a message type
        this.loadedSchemas.push({
          name: nested.name,
          type: nested,
          namespace: fullName,
        })
      } else if (nested instanceof protobuf.Namespace) {
        // Recursively extract from nested namespaces
        this.extractMessageTypes(nested, fullName)
      }
    }
  }

  public tryDecodeMessage(buffer: Uint8Array): { messageType: string; namespace: string; data: any } | undefined {
    if (this.loadedSchemas.length === 0) {
      return undefined
    }

    const compatibleResults = this.getCompatibleMessageTypes(buffer)
    if (compatibleResults.length === 0) {
      return undefined
    }

    // Return the first compatible result (they're already sorted by compatibility)
    return compatibleResults[0]
  }

  public getCompatibleMessageTypes(buffer: Uint8Array): Array<{ messageType: string; namespace: string; data: any; isHighlyCompatible: boolean }> {
    if (this.loadedSchemas.length === 0) {
      return []
    }

    const results: Array<{ messageType: string; namespace: string; data: any; isHighlyCompatible: boolean }> = []

    // Try to decode with each message type
    for (const schema of this.loadedSchemas) {
      try {
        const decoded = schema.type.decode(buffer)
        const verified = schema.type.verify(decoded)

        if (!verified) {
          const data = schema.type.toObject(decoded, {
            defaults: false,
            arrays: true,
            objects: true,
            oneofs: true,
          })

          // Check if the decoded data is meaningful (not just empty/default values)
          const isHighlyCompatible = this.hasSignificantContent(data)

          results.push({
            messageType: schema.name,
            namespace: schema.namespace,
            data,
            isHighlyCompatible,
          })
        }
      } catch {
        // Continue to next message type
      }
    }

    // Sort by compatibility: highly compatible first, then by name
    return results.sort((a, b) => {
      if (a.isHighlyCompatible !== b.isHighlyCompatible) {
        return a.isHighlyCompatible ? -1 : 1
      }
      return a.messageType.localeCompare(b.messageType)
    })
  }

  private hasSignificantContent(obj: any): boolean {
    if (obj === null || obj === undefined) {
      return false
    }

    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        return obj.length > 0 && obj.some(item => this.hasSignificantContent(item))
      }

      const keys = Object.keys(obj)
      if (keys.length === 0) {
        return false
      }

      // Check if any values are non-empty/non-default
      return keys.some(key => {
        const value = obj[key]
        if (value === null || value === undefined || value === '' || value === 0 || value === false) {
          return false
        }
        return this.hasSignificantContent(value)
      })
    }

    // Primitive values: consider non-empty strings, non-zero numbers, true booleans as significant
    return obj !== '' && obj !== 0 && obj !== false
  }

  public decodeKnownMessage(buffer: Uint8Array, messageTypeName: string): any | undefined {
    const schema = this.loadedSchemas.find(s => s.name === messageTypeName || s.namespace === messageTypeName)
    if (!schema) {
      return undefined
    }

    try {
      const decoded = schema.type.decode(buffer)
      return schema.type.toObject(decoded, {
        defaults: false,
        arrays: true,
        objects: true,
        oneofs: true,
      })
    } catch {
      return undefined
    }
  }

  public getAvailableMessageTypes(): { name: string; namespace: string }[] {
    return this.loadedSchemas.map(schema => ({
      name: schema.name,
      namespace: schema.namespace,
    }))
  }
}