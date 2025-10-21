import * as q from '../../../../backend/src/Model'
import { useCallback, useState, useEffect } from 'react'
import { TopicViewModel } from '../../model/TopicViewModel'
import { useSubscription } from './useSubscription'
import { useViewModel } from '../Tree/TreeNode/effects/useViewModel'
import { DecoderEnvelope } from '../../decoders/DecoderEnvelope'
import { Decoder } from '../../../../backend/src/Model/Decoder'

export type DecoderFunction = (message: q.Message) => DecoderEnvelope | undefined

/**
 * Provides the latest decoder for a topic, with support for per-message decoder overrides
 *
 * @param treeNode
 * @returns
 */
export function useDecoder(treeNode: q.TreeNode<TopicViewModel> | undefined): DecoderFunction {
  const viewModel = useViewModel(treeNode)
  const [decoder, setDecoder] = useState(viewModel?.decoder)
  const [messageDecoderVersion, setMessageDecoderVersion] = useState(0)

  // Update decoder when viewModel changes (e.g., when switching topics)
  useEffect(() => {
    setDecoder(viewModel?.decoder)
    setMessageDecoderVersion(0) // Reset version when topic changes
  }, [viewModel])

  useSubscription(viewModel?.onDecoderChange, setDecoder)
  useSubscription(viewModel?.onMessageDecoderChange, () => setMessageDecoderVersion(prev => prev + 1))

  return useCallback(
    message => {
      // Check for message-specific decoder override first
      const messageDecoder = viewModel?.getMessageDecoder(message)
      const activeDecoder = messageDecoder || decoder

      if (activeDecoder && message.payload) {
        const result = activeDecoder.decoder.decode(message.payload, activeDecoder.format)
        // Ensure the result always has a decoder property
        return result && typeof result === 'object' && 'decoder' in result
          ? result
          : { message: message.payload, decoder: Decoder.NONE }
      }
      return { message: message.payload ?? undefined, decoder: Decoder.NONE }
    },
    [decoder, viewModel, messageDecoderVersion]
  )
}
