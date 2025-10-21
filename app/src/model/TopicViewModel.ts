import * as q from '../../../backend/src/Model'
import { Destroyable } from '../../../backend/src/Model/Destroyable'
import { MessageDecoder, decoders } from '../decoders'
import { EventDispatcher } from '../../../events'

function findDecoder<T extends Destroyable>(node: q.TreeNode<T>): TopicDecoder | undefined {
  const decoder = decoders.find(
    decoder =>
      decoder.canDecodeTopic?.(node.path()) || (node.message?.payload && decoder.canDecodeData?.(node.message?.payload))
  )

  return decoder
    ? {
      decoder,
      format: undefined,
    }
    : undefined
}

type TopicDecoder = { decoder: MessageDecoder; format: string | undefined }

export class TopicViewModel implements Destroyable {
  private selected: boolean
  private expanded: boolean
  private owner: q.TreeNode<TopicViewModel> | undefined
  private _decoder?: TopicDecoder
  private defaultProtobufMessageType?: string
  /**
   * Reference counter for useViewModel hook
   */
  private referenceCounter = 0
  public selectionChange = new EventDispatcher<void>()
  public expandedChange = new EventDispatcher<void>()
  public onDecoderChange = new EventDispatcher<TopicDecoder | undefined>()
  public onMessageDecoderChange = new EventDispatcher<void>()

  get decoder(): TopicDecoder | undefined {
    if (!this._decoder) {
      this._decoder = this.owner && findDecoder(this.owner)
    }

    return this._decoder
  }

  set decoder(override: TopicDecoder | undefined) {
    this._decoder = override

    this.onDecoderChange.dispatch(override)
  }

  public constructor(treeNode: q.TreeNode<TopicViewModel>) {
    this.owner = treeNode
    this.selected = false
    this.expanded = false
  }

  public retain() {
    this.referenceCounter += 1
  }

  public release() {
    this.referenceCounter -= 1
    if (this.referenceCounter <= 0) {
      this.destroy()
    }
  }

  public destroy() {
    console.log('destroy', this.referenceCounter)
    if (this.owner) {
      this.owner.viewModel = undefined
      this.owner = undefined
    }
    this.selectionChange.removeAllListeners()
    this.onDecoderChange.removeAllListeners()
    this.expandedChange.removeAllListeners()
    this.onMessageDecoderChange.removeAllListeners()
  }

  public setMessageDecoder(message: q.Message, format: string | undefined, protobufMessageType?: string) {
    message.decoderFormat = format
    message.protobufMessageType = protobufMessageType
    this.onMessageDecoderChange.dispatch()
  }

  public setDefaultProtobufMessageType(protobufMessageType: string | undefined) {
    this.defaultProtobufMessageType = protobufMessageType
    this.onMessageDecoderChange.dispatch()
  }

  public getDefaultProtobufMessageType(): string | undefined {
    return this.defaultProtobufMessageType
  }

  public clearMessageDecoder(message: q.Message) {
    message.decoderFormat = undefined
    message.protobufMessageType = undefined
    this.onMessageDecoderChange.dispatch()
  }

  public getMessageDecoder(message: q.Message): TopicDecoder | undefined {
    if (message.decoderFormat) {
      const decoder = decoders.find(d => d.formats.includes(message.decoderFormat as any))
      if (decoder) {
        // For protobuf, use the specific message type as the format if available
        const format = message.protobufMessageType || message.decoderFormat
        return { decoder, format }
      }
    }

    // If this is a protobuf topic and we have a default message type, use it
    if (this.decoder?.format === 'Protobuf' && this.defaultProtobufMessageType && !message.decoderFormat) {
      return {
        decoder: this.decoder.decoder,
        format: this.defaultProtobufMessageType
      }
    }

    return this.decoder
  }

  public isSelected() {
    return this.selected
  }

  public isExpanded() {
    return this.expanded
  }

  public setSelected(selected: boolean) {
    this.selected = selected
    this.selectionChange.dispatch()
  }

  public setExpanded(expanded: boolean, fireEvent: boolean) {
    const didChange = this.expanded !== expanded
    this.expanded = expanded
    if (didChange && fireEvent) {
      this.expandedChange.dispatch()
    }
  }
}
