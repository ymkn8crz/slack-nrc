// TODO: 他チャンネルに投稿するときに使う
module.exports = (sendingContext, privateChannels) => {
  return {
    type: 'modal',
    callback_id: 'send_modal',
    private_metadata: sendingContext,  // 送る内容
    title: {
      type: 'plain_text',
      text: 'No Reaction Checker'
    },
    submit: {
      type: 'plain_text',
      text: '記録'
    },
    close: {
      type: 'plain_text',
      text: 'キャンセル'
    },
    notify_on_close: true,
    blocks: [
      {
        type: 'input',
        block_id: 'send_channel',
        element: {
          type: 'static_select',
          action_id: 'send_channel_selected',
          placeholder: {
            type: 'plain_text',
            text: 'プライベートチャンネル'
          },
          options: privateChannels,
        },
        label: {
          type: 'plain_text',
          text: '送信先'
        }
      },
    ]
  };
}