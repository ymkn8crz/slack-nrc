module.exports = (conversationsHistory, private_metadata) => {
  return {
    type: 'modal',
    callback_id: 'check_modal',
    private_metadata: private_metadata,
    title: {
      type: 'plain_text',
      text: 'No Reaction Checker'
    },
    submit: {
      type: 'plain_text',
      text: '確認'
    },
    close: {
      type: 'plain_text',
      text: 'キャンセル'
    },
    notify_on_close: true,
    blocks: [
      {
        type: 'input',
        block_id: 'message',
        element: {
          type: 'static_select',
          action_id: 'messsage_selected',
          placeholder: {
            type: 'plain_text',
            text: 'メッセージ'
          },
          options: conversationsHistory,
        },
        label: {
          type: 'plain_text',
          text: 'メッセージ'
        }
      },
      // TODO:スレッド(APIの都合上、いったん対象外)
      // TODO:ラジオボタン
    ]
  };
};
