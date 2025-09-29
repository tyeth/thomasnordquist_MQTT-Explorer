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

      // Add common protobuf types to avoid HTTP requests
      // this.root.addCommon()

      // Set up path resolution for imports
      this.root.resolvePath = (origin: string, target: string) => {
        console.log('[GenericProtobufSchemaLoader] Resolving import:', target, 'from:', origin)

        // Handle Google well-known types - these are already loaded by addCommon()
        if (target.startsWith('google/protobuf/')) {
          console.log('[GenericProtobufSchemaLoader] Using built-in Google type:', target)
          return target // Let protobuf.js handle it internally
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

        // Try relative to schema folder
        if (!path.isAbsolute(target)) {
          const resolved = path.resolve(this.schemaFolder!, target)
          if (fs.existsSync(resolved)) {
            console.log('[GenericProtobufSchemaLoader] Resolved relative to schema folder:', resolved)
            return resolved
          }
        }

        console.log('[GenericProtobufSchemaLoader] Using target as-is:', target)
        return target
      }

      // Load all proto files
      await this.root.load(protoFiles)
      console.log('[GenericProtobufSchemaLoader] Successfully loaded all proto files')

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

    // Try to decode with each message type until one succeeds
    for (const schema of this.loadedSchemas) {
      try {
        const decoded = schema.type.decode(buffer)
        const verified = schema.type.verify(decoded)

        if (!verified) {
          return {
            messageType: schema.name,
            namespace: schema.namespace,
            data: schema.type.toObject(decoded, {
              defaults: false,
              arrays: true,
              objects: true,
              oneofs: true,
            }),
          }
        }
      } catch {
        // Continue to next message type
      }
    }

    return undefined
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