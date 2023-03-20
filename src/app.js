require('dotenv').config();
const { App } = require('@slack/bolt')
const message = require('./modules/message')
const modal  = require('./modules/modal')
const send = require('./modules/send');
const record = require('./modules/record');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: 'my-state-secret',
  scopes: [
   'channels:read',
   'users:read',
   'chat:write',
   'channels:history',
   'commands',
   'im;history'
  ],
  installationStore: {
    storeInstallation: async (installation) => {
      if (installation.isEnterpriseInstall && installation.enterprise !== undefined) {
        return await database.set(installation.enterprise.id, installation);
      }
      if (installation.team !== undefined) {
        return await database.set(installation.team.id, installation);
      }
      throw new Error('Failed saving installation data to installationStore');
    },
    fetchInstallation: async (installQuery) => {
      if (installQuery.isEnterpriseInstall && installQuery.enterpriseId !== undefined) {
        return await database.get(installQuery.enterpriseId);
      }
      if (installQuery.teamId !== undefined) {
        return await database.get(installQuery.teamId);
      }
      throw new Error('Failed fetching installation');
    },
    deleteInstallation: async (installQuery) => {
      if (installQuery.isEnterpriseInstall && installQuery.enterpriseId !== undefined) {
        return await database.delete(installQuery.enterpriseId);
      }
      if (installQuery.teamId !== undefined) {
        return await database.delete(installQuery.teamId);
      }
      throw new Error('Failed to delete installation');
    },
  },
});

const main = async() => {
  await app.start(3000)
  console.log('Bolt app is running!')
}

main().catch((e) => {
  console.error(e)
})


let members // チャンネルに属するメンバー一覧
let users   // ワークスペースに属するメンバー一覧
const workspaceMembersName = {} // {メンバーID: メンバー名}
const workspaceMembersIsBot = {}  // {メンバーID: Botかどうか}
let channelMembers  // TODO:引数にまとめる？

// TODO:関数は別ファイルにまとめる？
// チャンネルに所属するメンバーを配列で取得
const getChannelMembers = (users, members) => {
  users.members.forEach(function(user) {
    if (user.real_name) {
      workspaceMembersName[user.id] = user.real_name
      workspaceMembersIsBot[user.id] = user.is_bot
    }
  })
  // TODO:チェック対象を制御するならここで行う？
  return members.members.filter(i => !workspaceMembersIsBot[i])
}

// スタンプを押していないメンバーをスタンプ別に集計
const getNoReactionMembersByStamp = (replies) => {
  const respondBlocksText = []  // 1メッセージのスタンプ名と名前のリスト
  if (replies.ok && replies.messages.length > 0 && replies.messages[0].reactions ) {
    const reactions = replies.messages[0].reactions

    for(let i = 0; i < reactions.length; i++){
      let noReactionMembers = channelMembers
        .filter(j =>
          reactions[i].users.indexOf(j) == -1
          && replies.messages[0].user.indexOf(j) == -1
        )
        .map(j => workspaceMembersName[j])

      let respondPlainText = noReactionMembers.length != 0
        ? `:${reactions[i].name}: ${noReactionMembers.join()}`
        : `:${reactions[i].name}: All OK !!!!!`

      respondBlocksText.push({
        type: 'section',
        text: {
          type: 'plain_text',
          text: respondPlainText
        }
      })
    }

    // TODO: メッセージの記録情報をここで設定
    // const sendMessage = JSON.stringify({
    //   message_ts: replies.messages[0].ts,
    //   respond_blocks_text: respondBlocksText
    // })

    // respondBlocksText.push(
    //   {
    //     type: 'actions',
    //     elements: [
    //       {
    //         type: 'button',
    //         text: {
    //           type: 'plain_text',
    //           text: '記録',
    //         },
    //         action_id: 'send',
    //         value: sendMessage,
    //       }
    //     ]
    //   }
    // )

  } else {
    respondBlocksText.push({
      type: 'section',
      text: {
        type: 'plain_text',
        text: 'no stamp'
      }
    })
  }

  return respondBlocksText
}

// メッセージで表示(クイック確認)
app.message(/進捗確認/, async ({ client, logger, body, ack }) => {
  try {
    members = await client.conversations.members({ channel: body.event.channel })
    if(!members.ok) {
      throw new Error(members.error)
    }
    
    users = await client.users.list()
    if (!users.ok) {
      throw new Error(users.error)
    }

    channelMembers = getChannelMembers(users, members)
    
    let ephemeral = await client.chat.postEphemeral({
      channel: body.event.channel,
      user: body.event.user,
      text: 'text',
      blocks: JSON.stringify(message(body.event.text, body.event.user, body.event.ts)),
    })

    if (!ephemeral.ok) {
      logger.info(`Failed to post a ephemeral message - ${ephemeral}`)
      throw new Error(ephemeral.error)
    };
    await ack();
  } catch (error) {
    logger.debug(error);
    // TODO:エラーハンドリング
    // await ack(
    //   `No Reaction Checkerの起動エラーが発生しました (コード: ${error.code})`
    // );
  } 
})

// モーダルを表示(あとから確認)
// TODO:どうしても遅くなる
app.command('/check', async ({ client, body, ack, logger }) => {
  try {
    members = await client.conversations.members({ channel: body.channel_id })
    if(!members.ok) {
      throw new Error(members.error)
    }
    
    users = await client.users.list()
    if (!users.ok) {
      throw new Error(users.error)
    }
    channelMembers = getChannelMembers(users, members)

    let history;
    history = await client.conversations.history({
      channel: body.channel_id,
      limit: 20,  // 暫定的に最大20件とする
    })
    if (!history.ok) {
      throw new Error(history.error)
    }

    const conversationsHistory = []
    history.messages.forEach((message) => {
      if (message.client_msg_id) {
        let messageDateTime = new Date(message.ts * 1000)
        let sliceMsgText;
        let selectMsgText;
        if (message.text.length > 50) {
          sliceMsgText = message.text.slice(0,50)
          selectMsgText = message.text.replace(/\r?\n/g, '').slice(0,20) + "....."
        } else if (message.text.length <= 50 && message.text.length > 20){
          sliceMsgText = message.text
          selectMsgText = message.text.replace(/\r?\n/g, '').slice(0,20) + "....."
        } else {
          sliceMsgText = message.text
          selectMsgText = message.text.replace(/\r?\n/g, '')
        }

        conversationsHistory.push({
          text: {
            type: 'plain_text',
            text: `${messageDateTime.toLocaleString('ja-JP')}：${selectMsgText}`
          },
          value: JSON.stringify({
            text: sliceMsgText,
            user: message.user,
            ts: message.ts
          })
        })
      }
    })

    const private_metadata = JSON.stringify({ channel_id: body.channel_id })

    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: modal(conversationsHistory, private_metadata)
    })
    if (!result.ok) {
      throw new Error(result.error)
    }
    await ack();
  } catch (error) {
    logger.debug(error);
  }
})

// モーダルを×で閉じる
app.view({ callback_id: 'check_modal', type: 'view_closed' }, async({ ack, logger }) => {
  logger.info('check_modal closed.')  // TODO:なくていい？
  await ack();
})

// メッセージの更新ボタンを押してリアクションチェック
app.action('update', async ({ ack, logger, client, respond, body }) => {
  try {
    if (channelMembers.length == 0) {
      throw new Error('No channelMembers')
    }
    const values = body.actions.find((e) => e.action_id === 'update').value

    let replies = await client.conversations.replies({
      channel: body.channel.id,
      ts: JSON.parse(values).ts
    })
    if (!replies.ok) {
      throw new Error(replies.error)
    }

    await respond({
      response_type: 'ephemeral',
      replace_original: true,
      blocks: JSON.stringify(message(replies.messages[0].text, JSON.parse(values).user, JSON.parse(values).ts).concat(getNoReactionMembersByStamp(replies))),
    });
    await ack();
  } catch (error) {
    logger.debug(error);
    // TODO:エラーハンドリング
  }
  // TODO:アイコンが変わる
})

// モーダルの確認ボタンを押してリアクションチェック
app.view('check_modal', async ({client, body, ack, view, logger}) => {
  try {
    if (channelMembers.length == 0) {
      throw new Error('No channelMembers')
    }
    const values = view.state.values.message.messsage_selected.selected_option.value
    const channelId = JSON.parse(view.private_metadata).channel_id

    let replies = await client.conversations.replies({
      channel: channelId,
      ts: JSON.parse(values).ts
    })
    if (!replies.ok) {
      throw new Error(replies.error)
    }

    let ephemeral = await client.chat.postEphemeral({
      channel: channelId,
      user: body.user.id,
      text: 'text',
      blocks: JSON.stringify(message(JSON.parse(values).text, JSON.parse(values).user, JSON.parse(values).ts).concat(getNoReactionMembersByStamp(replies))),
    })

    if (!ephemeral.ok) {
      logger.info(`Failed to post a ephemeral message - ${ephemeral}`)
      throw new Error(ephemeral.error)
    };
    
    await ack();
  } catch (error) {
    logger.debug(error)
    // TODO:エラーハンドリング
  }
})

// TODO: 記録用のプライベートチャンネルを選択するモーダルを出す
app.action('send', async ({ ack, logger, client, body }) => {
  try {
    // nrcをインストールしているプライベートチャンネルの一覧を取得
    let conversationsList;
    conversationsList = await client.conversations.list({
      types: 'private_channel'
    })
    if (!conversationsList.ok) {
      throw new Error(conversationsList.error)
    }

    if (conversationsList.channels.length > 0) {
      const privateChannels = []
      for (let i = 0; i < conversationsList.channels.length; i++) {
        privateChannels.push({
          text: {
            type: 'plain_text',
            text: conversationsList.channels[i].name
          },
          value: conversationsList.channels[i].id
        })
      }

      // 記録内容を設定
      const sendingContext = JSON.stringify({
        user: body.user,        // 確認ボタンを押したメンバー情報
        channel: body.channel,  // 送信側のチャンネル情報
        value: body.actions[0].value, // 送信する内容
      })
      
      // 送信先を決めるモーダルを出す
      const result = await client.views.open({
        trigger_id: body.trigger_id,
        view: send(sendingContext, privateChannels)
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
    } else {
      // プライベートチャンネルがなかったらエフェメラルメッセージで知らせる
    }
    await ack();
  } catch (error) {
    logger.debug(error)
  }
})

// TODO: モーダルを×で閉じる
app.view({ callback_id: 'send_modal', type: 'view_closed' }, async({ ack, logger }) => {
  logger.info('send_modal closed.')  // TODO:なくていい？
  await ack();
})

// TODO: 記録
app.view('send_modal', async ({client, ack, view, logger}) => {
  try {
    // 送信内容を取得
    const sendUser = JSON.parse(view.private_metadata).user
    const sendChannel = JSON.parse(view.private_metadata).channel
    const messageTs = JSON.parse(JSON.parse(view.private_metadata).value).message_ts
    const respondBlocksText = JSON.parse(JSON.parse(view.private_metadata).value).respond_blocks_text

    const recordMessage = await client.chat.postMessage({
      channel: view.state.values.send_channel.send_channel_selected.selected_option.value,
      text: 'text',
      blocks: JSON.stringify(record(sendUser,sendChannel,messageTs).concat(respondBlocksText)),
    })
    if (!recordMessage.ok) {
      throw new Error(record.error) 
    }
    await ack();
  } catch (error) {
    logger.debug(error)
  }
})
