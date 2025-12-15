import { useEffect, useState } from 'react'
import * as q from '../../../../backend/src/Model'

/**
 * Hook that forces component re-render when TreeNode properties change
 */
export function useTreeNodeChanges(node?: q.TreeNode<any>) {
  const [, forceUpdate] = useState({})

  useEffect(() => {
    if (!node) {
      return
    }

    const handleChange = () => {
      forceUpdate({})
    }

    // Subscribe to TreeNode events that indicate changes
    node.onMerge.subscribe(handleChange)
    node.onMessage.subscribe(handleChange)

    return () => {
      node.onMerge.unsubscribe(handleChange)
      node.onMessage.unsubscribe(handleChange)
    }
  }, [node])

  return node
}