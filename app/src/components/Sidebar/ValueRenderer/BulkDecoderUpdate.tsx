import React, { useCallback, useState } from 'react'
import * as q from '../../../../../backend/src/Model'
import { Button, Menu, MenuItem, Divider, ListSubheader } from '@material-ui/core'
import UpdateIcon from '@material-ui/icons/Update'
import { TopicViewModel } from '../../../model/TopicViewModel'
import { GenericProtobufSchemaLoader } from '../../../decoders/protobuf/GenericProtobufSchemaLoader'

interface Props {
    node: q.TreeNode<TopicViewModel>
}

export const BulkDecoderUpdate: React.FC<Props> = ({ node }) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
    const [protobufTypes, setProtobufTypes] = useState<Array<{ name: string; namespace: string }>>([])

    const handleClick = useCallback(
        async (event: React.MouseEvent<HTMLButtonElement>) => {
            setAnchorEl(event.currentTarget)

            // Load protobuf types when opening menu
            const schemaLoader = GenericProtobufSchemaLoader.getInstance()
            const types = schemaLoader.getAvailableMessageTypes()
            setProtobufTypes(types)
        },
        []
    )

    const handleClose = useCallback(() => {
        setAnchorEl(null)
    }, [])

    const updateUndecodedMessages = useCallback(
        (protobufType?: string) => {
            const history = node.messageHistory.toArray()
            let updatedCount = 0

            history.forEach(message => {
                // Only update messages without a decoder override
                if (!message.decoderFormat) {
                    const currentDecoder = node.viewModel?.decoder

                    // If the topic is using protobuf decoder, apply the message type
                    if (currentDecoder?.format === 'Protobuf') {
                        node.viewModel?.setMessageDecoder(message, 'Protobuf', protobufType)
                        updatedCount++
                    }
                }
            })

            console.log(`Updated ${updatedCount} messages with decoder override`)
            handleClose()
        },
        [node, handleClose]
    )

    const clearAllOverrides = useCallback(() => {
        const history = node.messageHistory.toArray()
        let clearedCount = 0

        history.forEach(message => {
            if (message.decoderFormat) {
                node.viewModel?.clearMessageDecoder(message)
                clearedCount++
            }
        })

        console.log(`Cleared ${clearedCount} message decoder overrides`)
        handleClose()
    }, [node, handleClose])

    const setDefaultProtobufType = useCallback((protobufType?: string) => {
        node.viewModel?.setDefaultProtobufMessageType(protobufType)
        console.log(`Set default protobuf type to: ${protobufType || 'auto-detect'}`)
        handleClose()
    }, [node, handleClose])

    const clearDefaultProtobufType = useCallback(() => {
        node.viewModel?.setDefaultProtobufMessageType(undefined)
        console.log('Cleared default protobuf type')
        handleClose()
    }, [node, handleClose])

    const isProtobufTopic = node.viewModel?.decoder?.format === 'Protobuf'
    const hasOverrides = node.messageHistory.toArray().some(m => m.decoderFormat)
    const defaultProtobufType = node.viewModel?.getDefaultProtobufMessageType()

    if (!isProtobufTopic && !hasOverrides) {
        return null
    }

    return (
        <>
            <Button
                size="small"
                startIcon={<UpdateIcon />}
                onClick={handleClick}
                style={{ fontSize: '11px', padding: '2px 8px', textTransform: 'none' }}
            >
                Bulk Update
            </Button>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                {isProtobufTopic && (
                    <>
                        <ListSubheader>Update Undecoded Messages</ListSubheader>
                        <MenuItem onClick={() => updateUndecodedMessages(undefined)}>
                            Use Auto-detect
                        </MenuItem>
                        {protobufTypes.map(type => (
                            <MenuItem
                                key={type.namespace}
                                onClick={() => updateUndecodedMessages(type.namespace)}
                                style={{ paddingLeft: '32px' }}
                                title={type.namespace}
                            >
                                {type.namespace}
                            </MenuItem>
                        ))}
                        <Divider />
                        <ListSubheader>Default Type for New Messages</ListSubheader>
                        {defaultProtobufType && (
                            <MenuItem onClick={clearDefaultProtobufType} style={{ color: '#ff9800' }}>
                                Clear Default ({defaultProtobufType})
                            </MenuItem>
                        )}
                        <MenuItem onClick={() => setDefaultProtobufType(undefined)}>
                            Auto-detect (default)
                        </MenuItem>
                        {protobufTypes.map(type => (
                            <MenuItem
                                key={`default-${type.namespace}`}
                                onClick={() => setDefaultProtobufType(type.namespace)}
                                style={{ paddingLeft: '32px' }}
                                title={type.namespace}
                            >
                                {type.namespace}
                                {(type.namespace === defaultProtobufType || type.name === defaultProtobufType) && ' 🔹'}
                            </MenuItem>
                        ))}
                    </>
                )}
                {hasOverrides && (
                    <>
                        {isProtobufTopic && <Divider />}
                        <MenuItem onClick={clearAllOverrides} style={{ color: '#f44336' }}>
                            Clear All Overrides
                        </MenuItem>
                    </>
                )}
            </Menu>
        </>
    )
}
