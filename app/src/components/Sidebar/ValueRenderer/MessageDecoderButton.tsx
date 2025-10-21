import React, { useCallback, useState, useEffect } from 'react'
import * as q from '../../../../../backend/src/Model'
import ClickAwayListener from '@material-ui/core/ClickAwayListener'
import Grow from '@material-ui/core/Grow'
import IconButton from '@material-ui/core/IconButton'
import Paper from '@material-ui/core/Paper'
import Popper from '@material-ui/core/Popper'
import MenuItem from '@material-ui/core/MenuItem'
import MenuList from '@material-ui/core/MenuList'
import SettingsIcon from '@material-ui/icons/Settings'
import ClearIcon from '@material-ui/icons/Clear'
import { MessageDecoder, decoders } from '../../../decoders'
import { Tooltip, Divider, ListSubheader } from '@material-ui/core'
import { TopicViewModel } from '../../../model/TopicViewModel'
import { GenericProtobufSchemaLoader } from '../../../decoders/protobuf/GenericProtobufSchemaLoader'

interface Props {
    message: q.Message
    node: q.TreeNode<TopicViewModel>
    currentFormat?: string
}

export const MessageDecoderButton = (props: Props) => {
    const { message, node } = props

    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
    const [open, setOpen] = React.useState(false)
    const [protobufTypes, setProtobufTypes] = useState<Array<{ name: string; namespace: string }>>([])
    const [selectedDecoder, setSelectedDecoder] = useState<string>('Protobuf')

    useEffect(() => {
        // Load available protobuf message types when component mounts
        const schemaLoader = GenericProtobufSchemaLoader.getInstance()
        const types = schemaLoader.getAvailableMessageTypes()
        setProtobufTypes(types)
    }, [])

    const options = decoders.flatMap(decoder => decoder.formats.map(format => [decoder, format] as const))

    const selectOption = useCallback(
        (decoder: MessageDecoder, format: string) => {
            setSelectedDecoder(format)
            if (format === 'Protobuf') {
                // Just set to Protobuf, will show submenu
                node.viewModel?.setMessageDecoder(message, format, undefined)
            } else {
                node.viewModel?.setMessageDecoder(message, format, undefined)
                setOpen(false)
            }
        },
        [node, message]
    )

    const selectProtobufType = useCallback(
        (messageType: string) => {
            node.viewModel?.setMessageDecoder(message, 'Protobuf', messageType)
            setOpen(false)
        },
        [node, message]
    )

    const setAsDefaultType = useCallback(
        (messageType: string) => {
            node.viewModel?.setDefaultProtobufMessageType(messageType)
            setOpen(false)
        },
        [node]
    )

    const clearOverride = useCallback(() => {
        node.viewModel?.clearMessageDecoder(message)
        setOpen(false)
    }, [node, message])

    const handleToggle = useCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation()
            event.preventDefault()
            if (open === true) {
                return
            }
            setAnchorEl(event.currentTarget)
            setOpen(prevOpen => !prevOpen)
        },
        [open]
    )

    const handleClose = useCallback((event: React.MouseEvent<Document, MouseEvent>) => {
        if (anchorEl && anchorEl.contains(event.target as HTMLElement)) {
            return
        }
        setOpen(false)
    }, [anchorEl])

    const hasOverride = Boolean(message.decoderFormat)
    const currentFormat = message.protobufMessageType || message.decoderFormat || node.viewModel?.decoder?.format || node.type
    const isProtobuf = message.decoderFormat === 'Protobuf' || (!message.decoderFormat && node.viewModel?.decoder?.format === 'Protobuf')
    const defaultProtobufType = node.viewModel?.getDefaultProtobufMessageType()

    return (
        <>
            <Tooltip title={hasOverride ? "Change decoder (has custom override)" : "Change decoder for this message"}>
                <IconButton
                    size="small"
                    onClick={handleToggle}
                    style={{
                        padding: '4px',
                        marginLeft: '4px',
                        color: hasOverride ? '#ff9800' : undefined
                    }}
                >
                    <SettingsIcon style={{ fontSize: '16px' }} />
                </IconButton>
            </Tooltip>
            <Popper open={open} anchorEl={anchorEl} role={undefined} transition placement="left-start" style={{ zIndex: 1500 }}>
                {({ TransitionProps, placement }) => (
                    <Grow
                        {...TransitionProps}
                        style={{
                            transformOrigin: placement === 'bottom' ? 'center top' : 'center bottom',
                        }}
                    >
                        <Paper style={{ maxHeight: '400px', overflow: 'auto' }}>
                            <ClickAwayListener onClickAway={handleClose}>
                                <MenuList id="messageDecoderMode">
                                    {hasOverride && (
                                        <>
                                            <MenuItem onClick={clearOverride} style={{ color: '#f44336' }}>
                                                <ClearIcon style={{ fontSize: '16px', marginRight: '8px' }} />
                                                Clear Override
                                            </MenuItem>
                                            <Divider />
                                        </>
                                    )}
                                    {options.map(([decoder, format], index) => (
                                        <MenuItem
                                            key={format}
                                            selected={format === (message.decoderFormat || node.viewModel?.decoder?.format)}
                                            onClick={() => selectOption(decoder, format)}
                                        >
                                            {format}
                                            {format === message.decoderFormat && ' (custom)'}
                                        </MenuItem>
                                    ))}
                                    {isProtobuf && protobufTypes.length > 0 && (
                                        <>
                                            <Divider />
                                            <ListSubheader>Protobuf Message Types</ListSubheader>
                                            {protobufTypes.map((type) => (
                                                <MenuItem
                                                    key={type.namespace}
                                                    selected={type.namespace === message.protobufMessageType || type.name === message.protobufMessageType}
                                                    onClick={() => selectProtobufType(type.namespace)}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault()
                                                        setAsDefaultType(type.namespace)
                                                    }}
                                                    style={{ paddingLeft: '32px' }}
                                                    title={type.namespace}
                                                >
                                                    {type.namespace}
                                                    {(type.namespace === message.protobufMessageType || type.name === message.protobufMessageType) && ' ✓'}
                                                    {(type.namespace === defaultProtobufType || type.name === defaultProtobufType) && ' 🔹'}
                                                </MenuItem>
                                            ))}
                                            <MenuItem
                                                style={{ paddingLeft: '32px', fontSize: '11px', fontStyle: 'italic', opacity: 0.7 }}
                                                disabled
                                            >
                                                Right-click to set as default for new messages
                                            </MenuItem>
                                        </>
                                    )}
                                </MenuList>
                            </ClickAwayListener>
                        </Paper>
                    </Grow>
                )}
            </Popper>
        </>
    )
}
