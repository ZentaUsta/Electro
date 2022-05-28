require("dotenv").config();

const { Telegraf, Telegram } = require("telegraf")

const ID_BOT     = process.env.ID_BOT || '';


const config = require("./config")
const db = require("./db")
const fs = require("fs")
const {arrayRandom, trueTrim, plusminus, pluralize, getUserLink} = require("./functions")
const telegram = new Telegram(config.token)
const bot = new Telegraf(config.token)
const path = require("path")
const dbfile = path.resolve(__dirname, "./db.json")


let gameStates = {}


bot.command("grupsayi", async (ctx) => {
    fs.readFile(dbfile, 'utf8', async function(err, doc) {
        var comments = doc.match(/-100\d+/g);
        if (comments && comments.length > 0) {
            await ctx.replyWithHTML(`<b>Gruplar:  ${comments.length}</b>`)
        } else {
            ctx.reply('Botta henüz oyun oynanmadı.')
        }
    })
});




const OyunYaratHusnuEhedov = chatId => {
	gameStates[chatId] = {
		timeouts: {},
		guessMessage: null,
		currentRound: null,
		currentTime: 0, 
		answersOrder: []
	}
	return gameStates[chatId]
}
const ozelMesaj = isGroup => trueTrim(`
    *Merhaba,Ben TeslaGameBot Tahmin Oyunu Zamanınızı eğlenceli hale getirimek için\nTelegram oyun botuyum🤖*
    ${isGroup ? "" : "\n*Temel komutların listesi için /yardim*"}
`)


const YasOyunBaslat = () => {
	let imagePath = "./resimler"
	let fimeName = arrayRandom(fs.readdirSync(imagePath))
	let age = Number(fimeName.match(/^(\d+)/)[1])
	return {
		age: age,
		photo: `${imagePath}/${fimeName}`
	}
}
const NesneYenileHusnuEhedov = (obj, f) => {
	let index = 0
	for (let key in obj) {
		f(key, obj[key], index)
		index++
	}
}
const dbChatAlHusnuEhedov = chatId => {
	let data = {
		isPlaying: true,
		members: {}
	}
	db.insert(chatId, data)
}
const dbUserAlHusnuEhedov = firstName => {
	return {
		firstName: firstName,
		isPlaying: true,
		answer: null,
		gameScore: 0,
		totalScore: 0
	}
}
const dbGrubAlHusnuEhedov = chatId => {
	return db.get(chatId)
}
const OyunDurdurHusnuEhedov = (ctx, chatId) => {
	let chat = dbGrubAlHusnuEhedov(chatId)
	if (chat && chat.isPlaying) {
		if (gameStates[chatId] && gameStates[chatId].timeouts) {
			for (let key in gameStates[chatId].timeouts) {
				clearTimeout(gameStates[chatId].timeouts[key])
			}
		}
		chat.isPlaying = false
		let top = []
		NesneYenileHusnuEhedov(chat.members, (memberId, member, memberIndex) => {
			if (member.isPlaying) {
				top.push({
					firstName: member.firstName,
					score: member.gameScore
				})

				Object.assign(member, {
					answer: null,
					isPlaying: false,
					gameScore: 0
				})
			}
		})
		db.update(chatId, ch => chat)
		if (top.length > 0) {
			ctx.replyWithMarkdown(trueTrim(`
				*🌟 Kazananlar Sıralaması:*

				${top.sort((a, b) => b.score - a.score).map((member, index) => `${["🏆","🎖","🏅"][index] || "🔸"} ${index + 1}. *${member.firstName}*: ${member.score} ${pluralize(member.score, "puan 🎁", "puan 🎁", "puan 🎁")}`).join("\n")}
			`))
		}
	}
	else {
		ctx.reply("🆘 Oyun başlamadı... 🙅🏻\nOyunu Başlat ➡️  /game")
	}
}
const getRoundMessage = (chatId, round, time) => {
	let chat = dbGrubAlHusnuEhedov(chatId)
	let answers = []
	NesneYenileHusnuEhedov(chat.members, (memberId, member, memberIndex) => {
		if (member.isPlaying && member.answer !== null) {
			answers.push({
				answer: member.answer,
				firstName: member.firstName,
				memberId: Number(memberId)
			})
		}
	})
	answers = answers.sort((a, b) => gameStates[chatId].answersOrder.indexOf(a.memberId) - gameStates[chatId].answersOrder.indexOf(b.memberId))

	return trueTrim(`
		*🔹 Raund ${round + 1}/${config.raundSayi}*
		❓ Sizce bu kişi kaç yaşında
		${answers.length > 0 ? 
			`\n${answers.map((member, index) => `${index + 1}. *${member.firstName}*: ${member.answer}`).join("\n")}\n`
			:
			""
		}
		${"◾️".repeat(time)}${"▫️".repeat(config.emojiSaniye - time)}
	`)
}
const OyunHusnuEhedov = (ctx, chatId) => {
	let gameState = OyunYaratHusnuEhedov(chatId)
	let startRound = async round => {
		let person = YasOyunBaslat()
		let rightAnswer = person.age
		let guessMessage = await ctx.replyWithPhoto({
			source: person.photo,
		}, {
			caption: getRoundMessage(chatId, round, 0),
			parse_mode: "Markdown"
		})
		gameState.currentTime = 0
		gameState.guessMessageId = guessMessage.message_id
		gameState.currentRound = round

		let time = 1
		gameState.timeouts.timer = setInterval(() => {
			gameState.currentTime = time
			telegram.editMessageCaption(
				ctx.chat.id,
				guessMessage.message_id,
				null,
				getRoundMessage(chatId, round, time),
				{
					parse_mode: "Markdown"
				}
			)
			time++
			if (time >= (config.emojiSaniye + 1)) clearInterval(gameState.timeouts.timer)
		}, config.saniye / (config.emojiSaniye + 1))
		
		gameState.timeouts.round = setTimeout(() => {
			let chat = dbGrubAlHusnuEhedov(chatId)
			let top = []
			NesneYenileHusnuEhedov(chat.members, (memberId, member, memberIndex) => {
				if (member.isPlaying) {
					let addScore = member.answer === null ? 0 : rightAnswer - Math.abs(rightAnswer - member.answer)
					chat.members[memberId].gameScore += addScore
					chat.members[memberId].totalScore += addScore
					top.push({
						firstName: member.firstName,
						addScore: addScore,
						answer: member.answer
					})
					member.answer = null
					db.update(chatId, ch => chat)
				}
			})
			db.update(chatId, ch => chat)
			
			if (!top.every(member => member.answer === null)) {
				ctx.replyWithMarkdown(
					trueTrim(`
						✅ Fotoğraftaki Kişi: *${rightAnswer} ${pluralize(rightAnswer, "yaşında", "yaşında", "yaşında")}*\n*⭐️Puan Kazananlar:*

						${top.sort((a, b) => b.addScore - a.addScore).map((member, index) => `${["🏆","🎖","🏅"][index] || "🔸"} ${index + 1}. *${member.firstName}*: ${plusminus(member.addScore)}`).join("\n")}
					`),
					{
						reply_to_message_id: guessMessage.message_id,
					}
				)
			}
			else {
				ctx.reply("Cevap verilmedi, Oyun Durduruldu❕")
				OyunDurdurHusnuEhedov(ctx, chatId)
				return
			}

			if (round === config.raundSayi - 1) {
				gameState.timeouts.OyunDurdurHusnuEhedov = setTimeout(() => {
					OyunDurdurHusnuEhedov(ctx, chatId)
				}, 1000)
			}
			else {
				gameState.answersOrder = []
				gameState.timeouts.afterRound = setTimeout(() => {
					startRound(++round)
				}, 2500)
			}
		}, config.saniye)
	}
	gameState.timeouts.beforeGame = setTimeout(() => {
		startRound(0)
	}, 1000)
}





bot.command("game", (ctx) => {
	let message = ctx.update.message
	if (message.chat.id < 0) {
		let chatId = message.chat.id
		let chat = dbGrubAlHusnuEhedov(chatId)
		if (chat) {
			if (chat.isPlaying) {
				return ctx.reply("❗️ Oyun şuan aktif, durdurmak için /stop.")
			}
			else {
				chat.isPlaying = true
				for (let key in chat.members) {
					let member = chat.members[key]
					member.gameScore = 0
				}
				db.update(chatId, ch => chat)
			}
		}
		else {
			dbChatAlHusnuEhedov(chatId)
		}
		ctx.replyWithMarkdown("*Yaş Tahmin Oyunu Başladı!*")
		OyunHusnuEhedov(ctx, chatId)
	}
	else {
		ctx.reply("🛑 Bu komut gruplar için geçerli")
	}
})



bot.command("stop", (ctx) => {
    let message = ctx.update.message
    if (message.chat.id < 0) {
        let chatId = message.chat.id
        OyunDurdurHusnuEhedov(ctx, chatId)
    }
    else {
        ctx.reply("🛑 Bu komut gruplar için geçerli")
    }
})


bot.command("kullanici", async (ctx) => {
    const Id = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : ctx.message.from.id;
    const messageId = ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : null;
    const photoInfo = await ctx.telegram.getUserProfilePhotos(Id);
    const photoId = photoInfo.photos[0]?.[0]?.file_id;
    const getUserInfo = await ctx.telegram.dbGrubAlHusnuEhedov(Id);
    const getUser = [getUserInfo].map(getUserLink).join(', ')
    if (photoId) {
        return ctx.replyWithPhoto(photoId, { caption: getUser, parse_mode: 'HTML', reply_to_message_id: messageId  })
    } else {
        return ctx.replyWithHTML(getUser,  { reply_to_message_id: messageId })
    }
});

bot.command("top", (ctx) => {
	let message = ctx.update.message
	if (message.chat.id < 0) {
		let chatId = message.chat.id
		let chat = dbGrubAlHusnuEhedov(chatId)
		if (chat) {
			let top = []
			NesneYenileHusnuEhedov(chat.members, (memberId, member, memberIndex) => {
				top.push({
					firstName: member.firstName,
					score: member.totalScore
				})

				Object.assign(member, {
					answer: null,
					isPlaying: false,
					gameScore: 0
				})
			})
			if (top.length > 0) {
				ctx.replyWithMarkdown(trueTrim(`
*✅ Grup En İyi TOP 20 Oyuncu:*

${top.sort((a, b) => b.score - a.score).slice(0, 20).map((member, index) => `${["","",""][index] || ""} ${index + 1}) *${member.firstName}*: ${member.score} ${pluralize(member.score, "puan🎁", "puan🎁", "puan🎁")}`).join("\n")}
				`))
			}
			else {
				ctx.reply("❗️ Bu grupta hiç oyun oynamadınız")
			}
		}
		else {
			ctx.reply("🛑 Bu komut gruplar için geçerli")
		}
	}
	else {
		ctx.reply("🛑 Bu komut gruplar için geçerli")
	}
})


bot.command("g", (ctx) => {
    fs.readFile(dbfile, 'utf8', async function(err, doc) {
        var comments = doc.match(/-100\d+/g)
        let top = []
        if (comments && comments.length > 0) {
            for (let i in comments) {
                let chatId = comments[i]
                let chat = dbGrubAlHusnuEhedov(chatId)
                NesneYenileHusnuEhedov(chat.members, (memberId, member, memberIndex) => {
                    top.push({
                        firstName: member.firstName,
                        score: member.totalScore
                    })

                    Object.assign(member, {
                        answer: null,
                        isPlaying: true,
                        gameScore: 0
                    })
                })
            }
            if (top.length > 0) {
                ctx.replyWithMarkdown(trueTrim(`
     *🎖Gruplar Üzre En İyi Top-20*\n
${(top).sort((a, b) => b.score - a.score).slice(0, 20).map((member, index) => `${["🏆","🥈","🥉"][index] || "🎲"} ${index + 1}) *${member.firstName}* → ${member.score} ${pluralize(member.score, "puan", "puan", "puan")}`).join("\n")}
                `))
            }
        }
    })
})

bot.start(async (ctx) => {
    await ctx.replyWithMarkdown(ozelMesaj(ctx.update.message.chat.id < 0),{
        reply_markup:{
            inline_keyboard:[
                [{text:'Botu Grupa Ekle ✅', url:`https://t.me/${config.botIsmi}?startgroup=true`}],
                [{text:'Resmi Kanalımız 📣', url:`t.me/${config.resmiKanal}`},{text:'VİP Gruplar 💎', callback_data:'vip'}]
            ]
        }
    })
})


bot.action('start', ctx=>{
    ctx.deleteMessage()
    ctx.replyWithMarkdown(`*Merhaba,Ben TeslaGameBot Tahmin Oyunu Zamanınızı eğlenceli hale getirimek için\nTelegram oyun botuyum🤖\n**Temel komutların listesi için /yardim*
        `,{
        reply_markup:{
            inline_keyboard:[
                [{text:'Botu Grupa Ekle ✅', url:`t.me/${config.botIsmi}?startgroup=true`}],
                [{text:'Resmi Kanalımız 📣', url:`t.me/${config.resmiKanal}`},{text:'VİP Gruplar 💎', callback_data:'vip'}]
            ]
        }
    })
})



bot.action('vip', ctx=>{
    ctx.deleteMessage()
    ctx.replyWithMarkdown(`*🌍 Ülkeler*`,{
        reply_markup:{
            inline_keyboard:[
                [{text:'🇦🇿 Azərbaycan', callback_data:'AZ'}],
                [{text:'🇹🇷 Türkiye', callback_data:'TR'}],
                [{text:'🔙 Geri', callback_data:'start'}]
            ]
        }
    })
})

// AZƏRBAYCAN GRUP DÜYMƏLƏRİ
bot.action('AZ', ctx=>{
    ctx.deleteMessage()
    ctx.replyWithMarkdown(`*🇦🇿 VİP Gruplar 🏆*`,{
        reply_markup:{
            inline_keyboard:[
                [{text:'1) Lʏᴜᴋꜱ Söʜʙəᴛ/OYUN 🇦🇿', url:'t.me/sohbet_lyuks'}],
                [{text:'2) 𝐀𝐊𝐌 ~ 𝐒ö𝐡𝐛ə𝐭 𝐐𝐫𝐮𝐩𝐮 🎲', url:'t.me/sohbet_akm'}],
                [{text:'🔙 Geri', callback_data:'vip'}]
            ]
        }
    })
})

// TÜRK GRUP DÜYMƏLƏRİ
bot.action('TR', ctx=>{
    ctx.deleteMessage()
    ctx.replyWithMarkdown(`
*🇹🇷 VİP Gruplar 🏆*
        `,{
        reply_markup:{
            inline_keyboard:[
                [{text:'𝑺𝒐𝒉𝒃𝒆𝒕 𝑶𝒏𝒍𝒊𝒏𝒆🇹🇷', url:'t.me/sohbet10line'}],
                [{text:'♔ ƓΛИƓSƬƐŔ ♔', url:'t.me/GNSagain'}],
                [{text:'🔙 Geri', callback_data:'vip'}]
            ]
        }
    })
})


bot.command("yardim", (ctx) => {
    return ctx.replyWithMarkdown(trueTrim(`
        *Merhaba! "Tahimin" oyunu için\noluşturulmuş bir botum🤖*\n🆘*Bot yalnızca gruplar için tasarlanmıştır!*\n\n_ℹ️Kurallar budur : Sana resimler atıyorum ve sen kategoriye uyğun rakamlarla tahmin etmelisin🕵🏼‍♂️,İlk olarak qrupa ekle ve Grupda medya izini açık olsun unutma! veya Botu yönetici yapın_🗣\n_Sonra Komutlarla ile oyunu başladın_🎯\n
          *Temel Komutların Listesi👇🏻*\n\n🎲 /game - _Oyunu Başlat_\n⛔️ /stop - _Oyunu durdurmak_\n📊 /top - _Oyuncuların puanı gösterir_\n_🌍 /g - Global Puanlar_\nℹ️ /yardim - _Size yardım edicek_\n👤 /kullanici - _Kullanıcı hakkında bilgi_\n🆔 /id - _Grup infosu_`))
})



bot.command('id', async (ctx, next) => {
	if (ctx.chat.type !== "supergroup") return null;
    const chatBio = ctx.chat.description
    await ctx.telegram.sendMessage(ctx.chat.id, `<b>Grup</b>\n🆔:<code>${ctx.chat.id}</code>\nİsim: <code>${ctx.chat.title}</code>`, { parse_mode: 'HTML' }) 
    return next();
});

bot.on("message", async (ctx) => {
	let message = ctx.update.message
	if (message.chat.id < 0) {
		let chatId = message.chat.id
		let fromId = message.from.id
		let chat = dbGrubAlHusnuEhedov(chatId)
		if (
			chat && 
			chat.isPlaying && 
			(chat.members[fromId] === undefined || chat.members[fromId].answer === null) && 
			gameStates && 
			/^-?\d+$/.test(message.text)
		) {
			let firstName = message.from.first_name
			let answer = Number(message.text)
			if (answer <= 0 || answer > 120) {
				return ctx.reply(
					"Cevap Sınırı (1 - 120)",
					{
						reply_to_message_id: ctx.message.message_id,
					}
				)
			}
			if (!chat.members[fromId]) { 
				chat.members[fromId] = dbUserAlHusnuEhedov(firstName)
			}
			Object.assign(chat.members[fromId], {
				isPlaying: true,
				answer: answer,
				firstName: firstName
			})
			gameStates[chatId].answersOrder.push(fromId)

			db.update(chatId, ch => chat)

			telegram.editMessageCaption(
				chatId,
				gameStates[chatId].guessMessageId,
				null,
				getRoundMessage(chatId, gameStates[chatId].currentRound, gameStates[chatId].currentTime),
				{
					parse_mode: "Markdown"
				}
			)
		}
		else if (message.new_chat_member && message.new_chat_member.id === process.env.ID_BOT) { //bot added to new chat
			ctx.replyWithMarkdown(ozelMesaj(true))
		}
	}
})

bot.catch((err, ctx) => {
	console.log("\x1b[41m%s\x1b[0m", `Ooops, encountered an error for ${ctx.updateType}`, err)
})

bot.catch((err) => {
    console.log('Error: ', err)
})

// Botun nickname alan kod
bot.telegram.getMe().then(botInfo => {
    bot.options.username = botInfo.username
    console.log(`Bot Aktif Oldu! => ${bot.options.username}`)
})

bot.launch();
