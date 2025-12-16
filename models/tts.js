/*
tts
*/
const fileUtil = require("../../utils/realFileUtil");
const https = require("https");
const mp3Duration = require("mp3-duration");
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath(require("@ffmpeg-installer/ffmpeg").path);
const { createGunzip, brotliDecompress } = require("zlib");
const crypto = require("crypto");
const tempfile = require("tempfile");
const voices = require("../data/voices.json").voices;
/**
 * uses tts demos to generate tts
 * @param {string} voiceName voice name
 * @param {string} text text
 * @returns {Buffer}
 */
module.exports = {
	processVoice(voiceName, text) {
		return new Promise(async (resolve, rej) => {
			const voice = voices[voiceName];
			if (!voice) {
				return rej("Requested voice is not supported");
			}

			try {
				switch (voice.source) {
					case "acapela": {
						const q = new URLSearchParams({
							voice: voice.arg,
							text: text,
							output: "stream",
							type: "mp3",
							samplerate: 22050,
							token: "bd8b22e3e5ebbaa05ea0055aec4e16c357c29486",
						}).toString();

						console.log(`https://www.acapela-cloud.com/api/command/?${q}`)
						https
							.get(
								{
									hostname: "acapela-cloud.com",
									path: `/api/command/?${q}`,
									headers: {
										"Host": "acapela-cloud.com",
										"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:107.0) Gecko/20100101 Firefox/107.0",
										"Accept": "*/*",
										"Accept-Language": "en-US,en;q=0.5",
										"Accept-Encoding": "gzip, deflate, br, zstd",
										"Origin": "https://www.acapela-group.com",
										"Cache-Control": "no-cache",
										"Priority": "u=4",
										"Connection": "keep-alive",
										"Referer": "https://www.acapela-group.com",
										"Sec-Fetch-Dest": "empty",
										"Sec-Fetch-Mode": "cors",
										"Sec-Fetch-Site": "cross-site"
									}
								}, resolve
							)
							.on("error", rej);
						break;
					}

					case "azure": {
					const req = https.request(
						{
							hostname: "lazypy.ro",
							path: "/tts/request_tts.php",
							method: "POST",
							headers: {
								"Content-type": "application/x-www-form-urlencoded"
							}
						},
						(r) => {
							let body = "";
							r.on("data", (b) => body += b);
							r.on("end", () => {
								const json = JSON.parse(body);
								console.log(JSON.stringify(json, undefined, 2))
								if (json.success !== true) {
									return rej(json.error_msg);
								}

								https.get(json.audio_url, (r) => {
								resolve(r);
								});							
							});
							r.on("error", rej);
						}
						
					).on("error", rej);
					req.end(
						new URLSearchParams({
							text: text,
							voice: voice.arg,
							service: "Bing Translator",
						}).toString()
					);
					break;
				}
	
				case "baidu": {
					const q = new URLSearchParams({
						lan: voice.arg,
						text: text,
						spd: "5",
						source: "web",
					}).toString();

					https
						.get(`https://fanyi.baidu.com/gettts?${q}`, resolve)
						.on("error", rej);
					break;
				}
				
					case "cepstral": {
						https.get("https://www.cepstral.com/en/demos", async (r) => {
							r.on("error", (e) => rej(e));
							const cookie = r.headers["set-cookie"];
							const q = new URLSearchParams({
								voiceText: text,
								voice: voice.arg,
								createTime: 666,
								rate: 170,
								pitch: 1,
								sfx: "none"
							}).toString();

							https.get(
								{
									hostname: "www.cepstral.com",
									path: `/demos/createAudio.php?${q}`,
									headers: { Cookie: cookie }
								},
								(r2) => {
									let body = "";
									r2.on("error", (e) => rej(e));
									r2.on("data", (c) => body += c);
									r2.on("end", () => {
										const json = JSON.parse(body);
										https.get(`https://www.cepstral.com${json.mp3_loc}`, (r3) => {
											r3.on("error", (e) => rej(e));
											resolve(r3);
										});
									});
								}
							);
						});
						break;
					}
					case "cereproc": {
						const req = https.request(
							{
								hostname: "app.cereproc.com",
								path: "/live-demo?ajax_form=1&_wrapper_format=drupal_ajax",
								method: "POST",
								headers: {
									"Content-Type": "application/x-www-form-urlencoded",
									"Accept-Encoding": "gzip, deflate, br, zstd",
									origin: "https://app.cereproc.com",
									referer: "https://app.cereproc.com/live-demo",
									"x-requested-with": "XMLHttpRequest"
								},
							},
							(r1) => {
								var buffers = [];
								r1.on("data", (d) => buffers.push(d));
								r1.on("end", () => {
									brotliDecompress(Buffer.concat(buffers), (err, data) => {
										if (err) {
											rej
										} else {
											let responseData = JSON.parse(data);
											const xml = responseData.find(e => typeof e.data == "string" && e.data.includes('cerevoice.s3.amazonaws.com')).data;
											const beg = xml.indexOf("https://");
											const end = xml.lastIndexOf(".wav") + 4;
											const loc = xml.substring(beg, end).toString();
											https.get(loc, (r2) => {
												fileUtil.convertToMp3(r2, "wav")
													.then(stream => resolve(stream))
													.catch(rej);
											}).on("error", rej);
										}
									})

								});
								r1.on("error", rej);
							}
						).on("error", rej);
						req.end(
							new URLSearchParams({
								text: text,
								voice: voice.arg,
								form_id: "live_demo_form"
							}).toString()
						);
						break;
					}
					
 				case "cobaltspeech": {
					const q = new URLSearchParams({
						"text.text": text,
						"config.model_id": voice.lang,
						"config.speaker_id": voice.arg,
					    "config.speech_rate": 1,
						"config.variation_scale": 0,
						"config.audio_format.codec": "AUDIO_CODEC_WAV"
					}).toString();

					https.get({
						hostname: "demo.cobaltspeech.com",
						path: `/voicegen/api/v1/synthesize?${q}`,
					}, (r) => fileUtil.convertToMp3(r, "wav").then(resolve).catch(rej)).on("error", rej);
					break;
				}
				case "elevenlabs": {
					const req = https.request(
						{
							hostname: "api.elevenlabs.io",
							path: "/v1/text-to-speech/" + voice.arg + "/stream",
							method: "POST",
							headers: {
								"Content-type": "application/json",
								"xi-api-key": "a08c21d2e286e4af4f93064ad73d6861"
							}
						},
						(r) => {
							let buffers = [];
							r
								.on("data", (b) => buffers.push(b))
								.on("end", () => resolve(Buffer.concat(buffers)))
								.on("error", rej);
						}
					).on("error", rej);
					req.end(JSON.stringify({
						text: text,
						model_id: "eleven_monolingual_v1"
					}));
					break;
				}

			case "festival": {
                var req = https.request({
                        hostname: "texttomp3.online",
                        path: "/php/logic/textToSpeech.php",
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF8",
							Host: "www.texttomp3.online",
							Origin: "https://www.texttomp3.online",
							Referer: "https://www.texttomp3.online/",
							"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36",
                        },
                    },
                    (r) => {
						var buffers = [];
						r.on("data", (b) => buffers.push(b));
                        r.on("end", () => {
							const mp3 = Buffer.concat(buffers).toString();
							const loc = `https://www.texttomp3.online/audio_tmp/${mp3}`
							get(loc).then(resolve).catch(rej);
						});
						r.on("error", rej);
					});
                    req.write(qs.encode({
                        msg: text,
                        voice: voice.arg,
						usebackmusic: 0,
						backmusicfile: "",
						backmusicvolume: ""
                    }));
					req.end();
					break;
			}

			case "google": {
                var req = https.request({
                        hostname: "texttospeechapi.wideo.co",
                        path: "/api/wideo-text-to-speech",
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
							Origin: "https://texttospeech.wideo.co",
							Referer: "https://texttospeech.wideo.co/",
							"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36",
                        },
                    },
                    (r) => {
						var buffers = [];
						r.on("data", (b) => buffers.push(b));
                        r.on("end", () => {
							var json = JSON.parse(Buffer.concat(buffers));
							get(`${json.url}`).then(resolve).catch(rej);
						});
						r.on("error", rej);
					});
					req.write(`{"data":{"text":"${text}","speed":1,"voice":"${voice.arg}"}}`);
					req.end();
					break;
			}
						
				case "googletranslate": {
					const q = new URLSearchParams({
						ie: "UTF-8",
                        total: 1,
                        idx: 0,
                        client: "tw-ob",
                        q: text,
                        tl: voice.arg,
					}).toString();

					https
						.get(`https://translate.google.com/translate_tts?${q}`, resolve)
						.on("error", rej);
					break;
				}

					case "polly": {
					const req = https.request(
						{
							hostname: "lazypy.ro",
							path: "/tts/request_tts.php",
							method: "POST",
							headers: {
								"Content-type": "application/x-www-form-urlencoded"
							}
						},
						(r) => {
							let body = "";
							r.on("data", (b) => body += b);
							r.on("end", () => {
								const json = JSON.parse(body);
								console.log(JSON.stringify(json, undefined, 2))
								if (json.success !== true) {
									return rej(json.error_msg);
								}

								https.get(json.audio_url, (r) => {
								resolve(r);
								});							
							});
							r.on("error", rej);
						}
						
					).on("error", rej);
					req.end(
						new URLSearchParams({
							text: text,
							voice: voice.arg,
							service: "Streamlabs",
						}).toString()
					);
					break;
				}
									
					case "polly2": {
					const body = new URLSearchParams({
						msg: text,
						lang: voice.arg,
						source: "ttsmp3"
					}).toString();

					const req = https.request(
						{
							hostname: "ttsmp3.com",
							path: "/makemp3_new.php",
							method: "POST",
							headers: { 
								"Content-Length": body.length,
								"Content-type": "application/x-www-form-urlencoded"
							}
						},
						(r) => {
							let body = "";
							r.on("data", (b) => body += b);
							r.on("end", () => {
								const json = JSON.parse(body);
								if (json.Error == 1) rej(json.Text);

								https
									.get(json.URL, resolve)
									.on("error", rej);
							});
							r.on("error", rej);
						}
					).on("error", rej);
					req.end(body);
					break;
				}
				
				case "pollyNeural": {
					const req = https.request(
						{
							hostname: "lazypy.ro",
							path: "/tts/request_tts.php",
							method: "POST",
							headers: {
								"Content-type": "application/x-www-form-urlencoded"
							}
						},
						(r) => {
							let body = "";
							r.on("data", (b) => body += b);
							r.on("end", () => {
								const json = JSON.parse(body);
								console.log(JSON.stringify(json, undefined, 2))
								if (json.success !== true) {
									return rej(json.error_msg);
								}

								https.get(json.audio_url, (r) => {
								resolve(r);
								});							
							});
							r.on("error", rej);
						}
						
					).on("error", rej);
					req.end(
						new URLSearchParams({
							text: text,
							voice: voice.arg,
							service: "Streamlabs",
						}).toString()
					);
					break;
				}
				
				case "readloud": {
						const body = new URLSearchParams({
							but1: text,
							butS: 0,
							butP: 0,
							butPauses: 0,
							butt0: "Submit",
						}).toString();
						const req = https.request(
							{
								hostname: "readloud.net",
								path: voice.arg,
								method: "POST",
								headers: {
									"Content-Type": "application/x-www-form-urlencoded"
								}
							},
							(r) => {
								let buffers = [];
								r.on("error", (e) => rej(e));
								r.on("data", (b) => buffers.push(b));
								r.on("end", () => {
									const html = Buffer.concat(buffers);
									const beg = html.indexOf("/tmp/");
									const end = html.indexOf("mp3", beg) + 3;
									const sub = html.subarray(beg, end).toString();

									https.get(`https://readloud.net${sub}`, (r2) => {
										r2.on("error", (e) => rej(e));
										resolve(r2);
									});
								});
							}
						).on("error", (e) => rej(e));
						req.end(body);
						break;
					}
					
 				case "sapi4": {
					const q = new URLSearchParams({
						text,
						voice: voice.arg
					}).toString();

					https.get({
						hostname: "www.tetyys.com",
						path: `/SAPI4/SAPI4?${q}`,
					}, (r) => fileUtil.convertToMp3(r, "wav").then(resolve).catch(rej)).on("error", rej);
					break;
				}

					case "svox2": {
						const q = new URLSearchParams({
							speed: 0,
							apikey: "38fcab81215eb701f711df929b793a89",
							text: text,
							action: "convert",
							voice: voice.arg,
							format: "mp3",
							e: "audio.mp3"
						}).toString();

						https
							.get(`https://api.ispeech.org/api/rest?${q}`, resolve)
							.on("error", rej);
						break;
					}

				case "tiktok": {
					const req = https.request(
						{
							hostname: "lazypy.ro",
							path: "/tts/request_tts.php",
							method: "POST",
							headers: {
								"Content-type": "application/x-www-form-urlencoded"
							}
						},
						(r) => {
							let body = "";
							r.on("data", (b) => body += b);
							r.on("end", () => {
								const json = JSON.parse(body);
								console.log(JSON.stringify(json, undefined, 2))
								if (json.success !== true) {
									return rej(json.error_msg);
								}

								https.get(json.audio_url, (r) => {
								resolve(r);
								});							
							});
							r.on("error", rej);
						}
						
					).on("error", rej);
					req.end(
						new URLSearchParams({
							text: text,
							voice: voice.arg,
							service: "TikTok",
						}).toString()
					);
					break;
				}
						
					case "vocalware": {
						const [EID, LID, VID] = voice.arg;
						const q = new URLSearchParams({
							EID,
							LID,
							VID,
							TXT: text,
							EXT: "mp3",
							FNAME: "",
							ACC: 15679,
							SceneID: 2703396,
							HTTP_ERR: "",
						}).toString();

						console.log(`https://cache-a.oddcast.com/tts/genB.php?${q}`)
						https
							.get(
								{
									hostname: "cache-a.oddcast.com",
									path: `/tts/genB.php?${q}`,
									headers: {
										"Host": "cache-a.oddcast.com",
										"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:107.0) Gecko/20100101 Firefox/107.0",
										"Accept": "*/*",
										"Accept-Language": "en-US,en;q=0.5",
										"Accept-Encoding": "gzip, deflate, br",
										"Origin": "https://www.oddcast.com",
										"DNT": 1,
										"Connection": "keep-alive",
										"Referer": "https://www.oddcast.com/",
										"Sec-Fetch-Dest": "empty",
										"Sec-Fetch-Mode": "cors",
										"Sec-Fetch-Site": "same-site"
									}
								}, resolve
							)
							.on("error", rej);
						break;
					}
					case "neospeechold": {
					const q = new URLSearchParams({
						speed: 0,
						apikey: "38fcab81215eb701f711df929b793a89",
						text: text,
						action: "convert",
						voice: voice.arg,
						format: "mp3",
						e: "audio.mp3"
					}).toString();

					https
						.get(`https://api.ispeech.org/api/rest?${q}`, resolve)
						.on("error", rej);
					break;
				}
					case "nuance": {
						const q = new URLSearchParams({
							voice_name: voice.arg,
							speak_text: text,
						}).toString();

						https
							.get(`https://voicedemo.codefactoryglobal.com/generate_audio.asp?${q}`, resolve)
							.on("error", rej);
						break;
					}
 				case "onecore": {
					const req = https.request(
                      {
						hostname: "support.readaloud.app",
						path: "/ttstool/createParts",
						method: "POST",
						headers: {
								"Content-Type": "application/json",
						},
					}, (r) => {
						let buffers = [];
						r.on("data", (d) => buffers.push(d)).on("error", rej).on("end", () => {
							https.get({
								hostname: "support.readaloud.app",
								path: `/ttstool/getParts?q=${JSON.parse(Buffer.concat(buffers))[0]}`,
								headers: {
									"Content-Type": "audio/mp3"
								}
							}, resolve).on("error", rej);
						});
					}).end(JSON.stringify([
						{
							voiceId: voice.arg,
							ssml: `<speak version="1.0" xml:lang="${voice.lang}">${text}</speak>`
						}
					])).on("error", rej);
					break;
				}
				case "onecore2": {
					const q = new URLSearchParams({
						hl: voice.lang,
						c: "MP3",
                        f: "16khz_16bit_stereo",
                        v: voice.arg,
                        src: text,
					}).toString();

					https
						.get(`https://api.voicerss.org/?key=83baa990727f47a89160431e874a8823&${q}`, resolve)
						.on("error", rej);
					break;
				}
					case "svox": {
						const q = new URLSearchParams({
							speed: 0,
							apikey: "ispeech-listenbutton-betauserkey",
							text: text,
							action: "convert",
							voice: voice.arg,
							format: "mp3",
							e: "audio.mp3"
						}).toString();

						https
							.get(`https://api.ispeech.org/api/rest?${q}`, resolve)
							.on("error", rej);
						break;
					}

				case "various": {
						const q = new URLSearchParams({
							voice: voice.arg,
							text: text
						}).toString();
	
						const req = http.request(
							{
								hostname: "speech.seediffusion.cc",
								port: 7774,
								path: `/synthesize?${q}`,
								method: "GET",
								headers: {
									"Content-Type": "application/x-wav"
									}
							}, (r) => {
								r.on("error", (e) => rej(e));
                                                                const http = require("http");
								fileUtil.convertToMp3(r, "wav")
									.then(stream => resolve(stream))
									.catch((e) => rej(e));
							}
						).on("error", (e) => rej(e));
						req.end();
						break;
					}

				case "vocodes": {
					const q = new URLSearchParams({
						text,
						voice: voice.arg
					}).toString();

					http.get({
						hostname: "fakeyou.com",
						path: `https://storage.googleapis.com/vocodes-public/media?${q}`,
					}, (r) => fileUtil.convertToMp3(r, "wav").then(resolve).catch(rej)).on("error", rej);
					break;
				}
				
		case 'voicery': {
				var q = qs.encode({
					text: text,
					speaker: voice.arg,
					ssml: text.includes('<'),
					//style: 'default',
				});
				https.get({
					host: 'www.voicery.com',
					path: `/api/generate?${q}`,
				}, r => {
					var buffers = [];
					r.on('data', d => buffers.push(d));
					r.on('end', () => resolve(Buffer.concat(buffers)));
					r.on('error', rej);
				});
				break;
			}
					
 					// again thx unicom for this fix
					case "voiceforge": {
						const vUtil = require("../../utils/voiceUtil");
						// the people want this
						text = await vUtil.convertText(text, voice.arg);
						const queryString = new URLSearchParams({
							msg: text,
							voice: voice.arg,
							email: "chopped@chin.com"
						}).toString();
						const req = https.request(
							{
								hostname: "api.voiceforge.com",
								path: `/swift_engine?${queryString}`,
								method: "GET",
								headers: {
									"Host": "api.voiceforge.com",
									"User-Agent": "just_audio/2.7.0 (Linux;Android 14) ExoPlayerLib/2.15.0",
									"Connection": "Keep-Alive",
									"Http_x_api_key": "8b3f76a8539",
									"Accept-Encoding": "gzip, deflate, br",
									"Icy-Metadata": "1",
								}
							}, (r) => {
								r.on("error", (e) => rej(e));
								fileUtil.convertToMp3(r, "wav")
									.then(stream => resolve(stream))
									.catch((e) => rej(e));
							}
						).on("error", (e) => rej(e));
						req.end();
						break;
					}
					case "watson": {
						const hexstring = crypto.randomBytes(16).toString("hex");
						const uuid = hexstring.substring(0,8) + "-" + hexstring.substring(8,12) + "-" + hexstring.substring(12,16) + "-" + hexstring.substring(16,20) + "-" + hexstring.substring(20);
						let req1 = https.request(
							{
								hostname: "tts-frontend.1poue1l648rk.us-east.codeengine.appdomain.cloud",
								path: "/api/tts/session",
								method: "POST",
								headers: {
									origin: "https://www.ibm.com",
									referer: "https://www.ibm.com/"
								},
							},
							(r1) => {
								let buffers = [];
								r1.on("data", (b) => buffers.push(b));
								r1.on("end", () => {
									const cookie = r1.headers["set-cookie"];
									let req2 = https.request(
										{
											hostname: "tts-frontend.1poue1l648rk.us-east.codeengine.appdomain.cloud",
											path: "/api/tts/store",
											method: "POST",
											headers: {
												origin: "https://www.ibm.com",
												referer: "https://www.ibm.com/",
												"Content-Type": "application/json",
												cookie: cookie
											},
										},
										(r2) => {
											let buffers = [];
											r2.on("data", (d) => buffers.push(d));
											r2.on("end", () => {
												const q = new URLSearchParams({
													voice: voice.arg,
													rate_percentage: 0,
													pitch_percentage: 0,
													id: uuid
												}).toString();
												let req3 = https.request(
													{
														hostname: "tts-frontend.1poue1l648rk.us-east.codeengine.appdomain.cloud",
														path: `/api/tts/newSynthesizer?${q}`,
														method: "GET",
														headers: {
															origin: "https://www.ibm.com",
															referer: "https://www.ibm.com/",
															cookie: cookie
														}
													},
													(r3) => {
														r3.on("error", rej);
														resolve(r3);
													}
												).on("error", rej);
												req3.end();
											});
											r2.on("error", rej);
										}
									).on("error", rej);
									req2.end(JSON.stringify({
										sessionID: uuid,
										text
									}));
								});
							}
						).on("error", rej);
						req1.end();
						break;
					}
					case "youdao": {
					const q = new URLSearchParams({
						audio: text,
						le: voice.arg,
						type: voice.type
					}).toString();

					https
						.get(`https://dict.youdao.com/dictvoice?${q}`, resolve)
						.on("error", rej);
					break;
				}
					default: {
						return rej("Not implemented");
					}
				}
			} catch (e) {
				return rej(e);
			}
		});
	},
	processAudio(voiceName, filepath) {
		return new Promise(async (resolve, rej) => {
			{
				duration = await mp3Duration(filepath) * 1e3;
				resolve([duration, filepath]);
			}
		});
	}
};
