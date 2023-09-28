<script lang="ts">
    import NDK, { NDKEvent, NDKNip07Signer, NDKPrivateKeySigner, NDKRelayList, NDKRelaySet, NDKUser, type NDKRelayUrl, type NostrEvent } from "@nostr-dev-kit/ndk";
    import { EventCard } from "@nostr-dev-kit/ndk-svelte-components";
    import { browser } from "$app/environment";
    import { requestProvider } from 'webln';
	import RelativeTime from "./RelativeTime.svelte";
	import { tick } from "svelte";
    import { slide } from "svelte/transition";
    import { nicelyFormattedSatNumber } from "./utils";
	import type { Tweet } from "./types";
	import { isReply, isRetweet, isThread } from "./utils";

    let webln: any;
    let user: NDKUser | undefined;

    requestProvider()
        .then(w => webln = w)

    const ndk = new NDK({
        explicitRelayUrls: [
            'wss://nos.lol',
            'wss://relay.snort.social',
            'wss://purplepag.es',
            'wss://pablof7z.nostr1.com'
        ]
    });

    let nip07Available = false;

    if (browser) {
        try {
            ndk.signer = new NDKNip07Signer();
            ndk.signer.user().then(() => nip07Available = true);
        } catch (e) {
            nip07Available = false;
        }
        ndk.connect(2500);
    }

    let tweetCount = 0;
    let processedTweetCount = 0;
    let allTweets: Record<string, Tweet> = {};
    let allTweetValues: Tweet[] = [];
    let retweets: Tweet[] = [];
    let nonReplyTweets: Tweet[] = [];
    let replyTweets: Tweet[] = [];
    let threadTweets: Tweet[] = [];
    let useSatelliteCDN = true;

    let tweetsToImport: Tweet[] = [];

    let myScreenName: string;

    let pubkey: string;
    let relayList: NDKRelayList;
    let relayListString: string;

    async function getUserRelays() {
        const user = await ndk.signer?.user();
        user.ndk = ndk;

        if (!user) {
            alert(`Could not find user`);
            return;
        }

        relayList = await user.relayList() || new NDKRelayList(ndk);
        if (relayList.writeRelayUrls.length === 0) {
            relayList.writeRelayUrls = [
                'wss://nos.lol',
                'wss://relay.snort.social',
                'wss://relay.damus.io',
                'wss://pablof7z.nostr1.com'
            ];
        }

        relayListString = relayList.writeRelayUrls.join('\n');
    }

    function updateRelayList() {
        relayList = new NDKRelayList(ndk);
        relayList.writeRelayUrls = relayListString.split('\n').filter(u => u.length > 3);
        relayList = relayList;
    }

    const handleFileChange = async (e) => {
        await ndk.signer?.user().then((u) => pubkey = u.hexpubkey).then(getUserRelays);

        allTweets = {};
        retweets = [];
        nonReplyTweets = [];
        replyTweets = [];
        threadTweets = [];
        tweetCount = 0;
        processedTweetCount = 0;

        const file = e.target.files[0];
        if (file && file.name.endsWith('.js')) {
        const text = await file.text();
        try {
            // Initialize window.YTD if it's not already defined
            window.YTD = window.YTD || {};
            window.YTD.tweets = window.YTD.tweets || {};

            // Execute the JavaScript code from the uploaded file
            eval(text);

            if (!window.YTD || !window.YTD.tweets) {
                alert(`Could not find any tweets in the file. Did you choose the right file?`);
                return;
            }

            const keys: [string, any[]][] = Object.entries(window.YTD.tweets);

            for (const [key, part] of keys) {
                await new Promise<void>((resolve) => {
                    tweetCount = window.YTD.tweets[key].length;
                    tick();

                    setTimeout(() => {
                        part.forEach((t: { tweet: Tweet }) => {
                            const tweet = t.tweet;
                            const date = new Date(Date.parse(tweet.created_at));
                            tweet.timestamp = date.getTime();
                            allTweets[tweet.id_str] = tweet;
                            tick();
                        });

                        tick();

                        let i = 0;
                        allTweetValues = Object.values(allTweets);
                        allTweetValues.forEach((t: Tweet) => {
                            setTimeout(() => {
                                const reply = isReply(t, myScreenName);
                                const thread = isThread(t, reply, allTweetValues);
                                const retweet = isRetweet(t);

                                if (thread) threadTweets.push(t);
                                if (reply) replyTweets.push(t);
                                if (retweet) retweets.push(t);
                                if (!reply && !retweet && !thread) nonReplyTweets.push(t);

                                processedTweetCount++;
                            }, i++*2);
                        });

                        resolve();
                    }, 500);
                })
            }
        } catch (error) {
            console.error('An error occurred while executing the uploaded script:', error);
        }
        }
    };

    let includeThreads = false;
    let includeNonReplies = false;
    let includeRT = false;
    let includeReplies = false

    $: tweetsToImport = allTweetValues.filter((t: Tweet) => {
        if (includeThreads && threadTweets.find((tt) => tt.id_str === t.id_str)) {
            return true;
        }

        if (!includeNonReplies && !t.in_reply_to_status_id_str) {
            return false;
        }

        if (!includeRT && isRetweet(t)) {
            return false;
        }

        if (!includeReplies && t.in_reply_to_status_id_str) {
            return false;
        }

        return true;
    }).sort((a, b) => a.timestamp! - b.timestamp!);

    // Declare the events variable
    let events = new Map<string, NDKEvent>();
    let includeEvent: Record<string, boolean> = {};
    let publishingError: Record<string, string> = {};
    let publishedEvents: Map<string, NDKRelayUrl[]> = new Map();

    async function createEvent(id: string): Promise<NDKEvent | undefined> {
        // find tweet by id
        const tweet = allTweets[id];

        if (!tweet) {
            console.log(`could not find tweet ${id}`);
            return;
        }

        const url = `https://twitter.com/${myScreenName}/status/${id}`;

        const event = new NDKEvent(ndk, {
            content: tweet.full_text,
            kind: 1,
            created_at: tweet.timestamp! / 1000,
            tags: [
                [ "proxy", url, "web" ]
            ],
            pubkey
        } as NostrEvent);

        for (const hashtag of tweet.entities?.hashtags) {
            event.tags.push(["t", hashtag.text]);
        }

        // check if this tweet is a reply
        const replyToId = tweet.in_reply_to_status_id_str;

        if (replyToId) {
            // if it is, check if the reply is in the events map
            let replyEvent = events.get(replyToId!);

            // if it's not, create it
            if (!replyEvent) replyEvent = await createEvent(replyToId!);

            if (replyEvent) {
                // add the reply event as a parent
                event.tag(replyEvent, "reply");
            } else {
                const replyScreename = tweet.in_reply_to_screen_name;
                const replyUrl = `https://twitter.com/${replyScreename}/status/${replyToId}`;

                event.content = `Replying to ${replyUrl}:\n\n` + event.content;
            }
        }

        if (tweet.extended_entities?.media) {
            for (const extEntity of tweet.extended_entities?.media) {
                event.content = event.content.replace(extEntity.url, extEntity.media_url_https);
            }
        }

        await event.toNostrEvent();

        events.set(id, event);
        includeEvent[event.id] = true;

        return event;
    }

    async function fetchAndUploadToSatelliteCDN(url: string): Promise<string | undefined> {
        const downloadResponse = await fetch(url);
        if (!downloadResponse.ok) {
            console.log(`Failed to download image: ${downloadResponse.statusText}`);
            return;
        }
        const file: Blob = await downloadResponse.blob();
        const uploadEvent = new NDKEvent(ndk, {
            created_at: Math.ceil(Date.now() / 1000),
            kind: 22242,
            content: 'Authorize Upload',
        } as NostrEvent)
        await uploadEvent.sign();

        const uploadResponse = await fetch(`https://api.satellite.earth/v1/media/item?auth=${encodeURIComponent(JSON.stringify(uploadEvent.rawEvent()))}`, {
            method: 'PUT',
            body: file,
        });

        if (!uploadResponse.ok) {
            console.error(`Failed to upload image: ${uploadResponse.statusText}`);
            return;
        }

        const json = await uploadResponse.json();
        return json.url;
    }

    let generatingEvents = false;

    async function createEvents() {
        events = new Map<string, NDKEvent>();
        generatingEvents = true;
        for (const tweet of tweetsToImport) {
            setTimeout(async () => {
                const tweetId = tweet.id_str;

                if (!events.has(tweetId)) {
                    await createEvent(tweetId);
                }
            }, 150);
        }

        events = events;
        generatingEvents = false;
    }

    let continueButton = false;

    async function publishEvents() {
        let deleteIds: string[] = [];
        continueButton = false;

        if (webln && satsPerTweet) {
            const zapAmount = satsPerTweet * includedEventCount;

            if (zapAmount > 0) {
                let pr;
                try {
                    const event = await ndk.fetchEvent("nevent1qqsy6k5375ccgqz80jzv2g69ygx79k5x0d3srjkk6007h8c2lscy0ygrcvvny");

                    if (!event) {
                        alert(`Could not find event`);
                        return;
                    }

                    pr = await event.zap(zapAmount * 1000);
                } catch (e) {
                    alert(`Zap didn't work! Proceeding without V4V 😅:` + e);
                    return;
                }

                if (pr) {
                    try {
                        await webln.sendPayment(pr);
                    } catch (e) {
                        alert(e);
                        return;
                    }
                } else {
                    alert(`Could not create payment request 🤔`);
                }
            }
        }

        const relaySet = NDKRelaySet.fromRelayUrls(relayList.writeRelayUrls, ndk);

        // start a delete interval that will send deletion of replaced events
        setInterval(async () => {
            // get the first fifty elements and remove them from the array
            console.log({deleteIds})
            const ids = deleteIds.splice(0, 50);
            console.log({ids})

            if (ids.length > 0) {
                const deleteEvent = new NDKEvent(ndk, {
                    kind: 5,
                    content: "Replaced by another event",
                    tags: ids.map((id) => [ "e", id ])
                } as NostrEvent);
                await deleteEvent.sign();
                await deleteEvent.publish(relaySet, 2000);
            }
        }, 5000);

        let sequentialFailures = 0;

        for (const [ tweetId, event ] of events.entries()) {
            if (!includeEvent[event.id]) continue;
            if (publishedEvents.has(event.id)) continue;
            if (continueButton) break;

            const tweet = allTweets[tweetId];

            if (!event) {
                console.log(`Could not find event for ${tweetId}`);
                continue;
            }

            if (useSatelliteCDN) {
                if (tweet.extended_entities?.media) {
                    const prevId = event.id;
                    event.id = "";

                    for (const extEntity of tweet.extended_entities?.media) {
                        const upload = await fetchAndUploadToSatelliteCDN(extEntity.media_url_https);
                        if (upload) {
                            event.content = event.content.replace(extEntity.media_url_https, upload);
                        }
                    }

                    delete includeEvent[event.id];
                    await event.toNostrEvent();
                    includeEvent[event.id] = true;

                    if (prevId !== event.id) {
                        console.log(`Replacing ${prevId} with ${event.id}`);
                        deleteIds.push(prevId);
                    }
                }
            }

            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    if (sequentialFailures > 10) {
                        if (!continueButton) {
                            alert(`Too many failures, stopping. Wait a few minutes and hit the "CONTINUE" button`);
                        }
                        continueButton = true;
                        resolve();
                        return;
                    }

                    try {
                        await event.sign();
                        console.log(`sending publish for ${event.id}`);
                        const published = await event.publish(relaySet, 2000);
                        console.log(`publish for ${event.id} sent with ${published.size} relays received`);
                        event.relay = Array.from(published)[0];

                        sequentialFailures = 0;
                        const relays = Array.from(published.values()).map((r) => r.url);
                        publishedEvents.set(event.id, relays);
                        publishedEvents = publishedEvents;
                    } catch (e: any) {
                        publishingError[event.id] = e.message;
                        sequentialFailures++;
                        console.error(e);
                    }
                    resolve();
                }, 1);
            });
        }
    }

    let satsPerTweet: number | undefined = 50;

    let includedEventCount = 0;

    $: includedEventCount = Array.from(events.values()).filter((e) => includeEvent[e.id]).length;

    let filter: string;

    function selectAllVisibile() {
        const elements = document.querySelectorAll('[data-id]');
        for (const element of elements) {
            const id = element.getAttribute('data-id');
            if (id) includeEvent[id] = true;
        }
    }

    function unselectAllVisibile() {
        const elements = document.querySelectorAll('[data-id]');
        for (const element of elements) {
            const id = element.getAttribute('data-id');
            if (id) includeEvent[id] = false;
        }
    }

    let nsec: string;

    async function setPrivateKeySigner() {
        try {
            ndk.signer = new NDKPrivateKeySigner(nsec);
            const user = await ndk.signer.user();
            pubkey = user.hexpubkey;
            await getUserRelays();
        } catch (e) {
            alert(e);
        }
    }


	function addRelay() {
        relayListString += '\n' + 'wss://relay.exit.pub';
        updateRelayList();
	}
</script>

<svelte:head>
    <title>EXIT.pub -- Leave Elon's walled-garden and take your goodies with you.</title>
</svelte:head>

<div class="max-w-prose mx-auto">
    <div class="flex flex-row gap-4 my-4">
        <img src="https://api.tasktiger.io/media/91cfbb51-f100-48ef-8945-ad5937fa848e.png" class="rounded-lg h-32" />

        <div class="flex flex-col gap-2 items-start">
            <h1 class="flex flex-row mx-auto items-center text-7xl font-black w-full">
                E
                <svg viewBox="0 0 24 24" aria-hidden="true" class="w-16"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg>
                IT<span class="font-thin">.pub</span>
                <span class="text-base self-end font-normal ml-4 text-purple-500 block">by @pablof7z</span>
            </h1>

            <h2 class="text-xl whitespace-nowrap">
                Leave Elon's walled garden and take your goodies with you.
            </h2>

        </div>
    </div>

    {#if !nip07Available}
        <div class="alert alert-neutral my-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="self-start stroke-neutral shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div class="flex flex-col gap-4">
                <span>
                    Looks like you don't have a Nostr Extension (NIP-07), you'll need to enter your nsec to sign
                    events, or use EXIT from a browser with NIP-07.
                </span>

                <p>
                    Your nsec will <b>not</b> be saved anywhere.
                </p>

                <div class="join join-horizontal">
                    <input type="text" bind:value={nsec} placeholder="nsec" class="input input-bordered w-full" />
                    <button class="btn btn-primary" on:click={setPrivateKeySigner}>
                        Set
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <ul class="steps steps-vertical">
        <li class="step step-primary">
            <div>
                Gently request a backup of your X data <a href="https://twitter.com/settings/download_your_data" class="btn btn-info ml-2" target="_blank">open twitter</a>.
            </div>
        </li>
        <li class="step step-primary">Wait until Elon approves your request</li>
        <li class="step step-primary">Unzip the compressed file</li>
        <li
            class="step"
            class:step-primary={!!myScreenName}
        >
            <div>
                Enter your twitter handle:
                <input type="text" class="input input-primary w-64" bind:value={myScreenName} />
            </div>
        </li>
        <li
            class="step"
            class:step-primary={tweetCount && tweetCount > 0 && processedTweetCount === tweetCount}
        >
            <div>
                {#if tweetCount && tweetCount > 0 && processedTweetCount < tweetCount}
                    <div class="alert alert-neutral">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-info shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <p>
                            Tweets loaded: {tweetCount}, processing your tweets:
                            {Math.round(processedTweetCount/tweetCount*1000)/10}%
                        </p>
                    </div>
                {:else}
                    <label
                        for="file"
                        class="btn btn-primary"
                    >
                        <input type="file" class="hidden" id="file" accept=".js" on:change={handleFileChange} />
                        Open <code>tweets.js</code> File
                    </label>
                {/if}
            </div>
        </li>
    </ul>

    <div class="py-4" class:hidden={satsPerTweet === undefined}>
        <h1 class="text-xl">
            <b class="block">Optionally use Value-4-value:</b>
            Enter an amount of sats you'd like to ⚡️ zap me for each imported tweet</h1>

        <input type="range" min="0" max="1000" class="range range-primary" bind:value={satsPerTweet} />
        <input type="text" bind:value={satsPerTweet} class="input input-primary w-20 text-center" />
        sats per tweet
    </div>

    {#if tweetCount}
        <p>Tweets to import {tweetsToImport.length}</p>
    {/if}

    {#if tweetCount > 0 && processedTweetCount === tweetCount}
        <div class="form-control">
            <label class="label cursor-pointer w-fit">
                <input type="checkbox" class="checkbox mr-2" bind:checked={includeThreads} />
                <span class="label-text w-fit">
                    Include threads
                </span>
            </label>
        </div>

        <div class="form-control">
            <label class="label cursor-pointer w-fit">
                <input type="checkbox" class="checkbox mr-2" bind:checked={includeNonReplies} />
                <span class="label-text w-fit">
                    Include OP tweets (tweets you made that are not replies to someone else)
                </span>
            </label>
        </div>

        <div class="form-control">
            <label class="label cursor-pointer w-fit">
                <input type="checkbox" class="checkbox mr-2" bind:checked={includeReplies} />
                <span class="label-text w-fit">
                    Include Replies
                </span>
            </label>
        </div>

        <div class="form-control">
            <label class="label cursor-pointer w-fit">
                <input type="checkbox" class="checkbox mr-2" bind:checked={includeRT} />
                <span class="label-text w-fit">
                    Include Retweets
                </span>
            </label>
        </div>
    {/if}

    <!-- {#each tweetsToImport.slice(0, 1000) as tweet}
        <div class="card card-compact shadow">
            <div class="card-body">
                {tweet.full_text}
                <p>{tweet.favorite_count}</p>
                <p>{tweet.timestamp}</p>
            </div>
        </div>
    {/each} -->

    <button class="btn btn-wide btn-primary" on:click={createEvents} disabled={tweetsToImport.length === 0 || !pubkey}>
        Preview events
        {#if generatingEvents}
            <span class="loading loading-lg ml-2"></span>
        {/if}
    </button>

    {#if events.size > 0}
        <div class="mockup-browser border bg-base-300 my-2">
            <div class="mockup-browser-toolbar">
                <div class="input">
                    {includedEventCount} events to publish
                </div>
            </div>

            <div class="bg-base-300 w-full p-2 flex flex-row justify-between">
                <div class="flex flex-row gap-2">
                    Tweets containing
                    <input type="text" class="input input-sm" placeholder="Search" bind:value={filter} />
                </div>

                <div class="flex flex-row gap-2">
                    <button on:click={selectAllVisibile} class="btn btn-neutral btn-sm">Select all</button>
                    <button on:click={unselectAllVisibile} class="btn btn-neutral btn-sm">Unselect all</button>
                </div>
            </div>

            <div class="px-4 py-4 bg-base-200 max-h-[50vh] overflow-y-auto overflow-x-hidden">
                {#each Array.from(events.values()) as event}
                    {#if (!filter || event.content.toLowerCase().includes(filter.toLowerCase())) && !publishedEvents.has(event.id)}
                        <label
                            class="flex flex-row items-start my-4 gap-2 duration-200 transition-all cursor-pointer"
                            transition:slide
                            class:opacity-50={!includeEvent[event.id]}
                            data-id={event.id}
                        >
                            <div class="flex flex-col gap-2 w-full">
                                <EventCard {ndk} {event} class="flex-grow" />
                                <div class="text-xs">
                                    <RelativeTime {event} />

                                    {#if publishedEvents.has(event.id)}
                                        <a href="https://njump.me/{event.encode()}" target="_blank" class="text-success inline-block w-64">
                                            <span class="truncate">
                                                {event.encode()}
                                            </span>
                                        </a>
                                    {:else if publishingError[event.id]}
                                        <span class="text-error">
                                            {publishingError[event.id]}
                                        </span>
                                    {/if}
                                </div>
                                <!-- <pre>{JSON.stringify(event.rawEvent(), null, 2)}</pre> -->
                            </div>
                            <input type="checkbox" class="checkbox mt-2" bind:checked={includeEvent[event.id]} />
                        </label>
                    {/if}
                {/each}

                Published events:

                {#each Array.from(events.values()) as event}
                    {#if (!filter || event.content.toLowerCase().includes(filter.toLowerCase())) && publishedEvents.has(event.id)}
                        <div
                            class="flex flex-row items-start my-4 gap-2 duration-200 transition-all cursor-pointer"
                            class:opacity-50={!includeEvent[event.id]}
                            data-id={event.id}
                        >
                            <div class="flex flex-col gap-2 w-full">
                                <EventCard {ndk} {event} class="flex-grow" />
                                <div class="text-xs flex flex-row items-center justify-between">
                                    <RelativeTime {event} />

                                    <div class="flex flex-row items-center gap-1.5">
                                        {#each publishedEvents.get(event.id)??[] as relay}
                                            <div class="tooltip" data-tip={relay}>
                                                <div class="badge badge-primary badge-sm"></div>
                                            </div>
                                        {/each}
                                    </div>

                                    <a href="https://njump.me/{event.encode()}" target="_blank" class="text-success inline-block w-64 truncate">
                                        <span class="">
                                            {event.encode()}
                                        </span>
                                    </a>
                                </div>
                                <!-- <pre>{JSON.stringify(event.rawEvent(), null, 2)}</pre> -->
                            </div>
                            <a href="https://njump.me/{event.encode()}" target="_blank">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" class="fill-success w-8 h-8"><rect width="256" height="256" fill="none"/><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"/></svg>
                            </a>
                        </div>
                    {/if}
                {/each}
            </div>
        </div>
    {/if}

    <div class="my-6"></div>

    {#if publishedEvents.size === 0}
        <div class="form-control">
            <label class="label cursor-pointer w-fit">
                <input type="checkbox" class="checkbox mr-2" bind:checked={useSatelliteCDN} />
                <span class="label-text w-fit">
                    Upload images to Satellite's CDN
                    [<a href="https://satellite.earth/cdn" class="text-primary">purchase credit here</a>]
                </span>
            </label>
        </div>
    {/if}

    {#if continueButton && publishedEvents.size === 0}
        <div class="alert alert-neutral">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-info self-start shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div class="flex flex-col gap-4">
                <p>
                    Looks like your selected relays are not accepting your events; many relays do this.
                    You can spin up your own relay and configure it to accept your tweets; you can also
                    use my relay I created for this specific usecase.
                </p>

                <p>
                    wss://relay.exit.pub
                    <button class="btn btn-primary btn-sm" on:click={addRelay}>Add</button>
                </p>
            </div>
        </div>
    {/if}

    <div class="flex flex-row items-center gap-4">
        <button class="btn btn-lg btn-wide btn-primary whitespace-nowrap flex-nowrap" on:click={publishEvents} disabled={includedEventCount === 0 || publishedEvents.size > 0}>
            {#if !continueButton}
                Publish events
            {:else}
                Continue Publishing
            {/if}
            {#if publishedEvents.size === 0}
                {#if satsPerTweet !== undefined && satsPerTweet > 0 && includedEventCount > 0}
                    <span class="text-sm font-thin">{nicelyFormattedSatNumber(satsPerTweet * includedEventCount)} sats</span>
                {/if}
            {/if}
        </button>

        {#if publishedEvents.size > 0}
            {publishedEvents.size}/{includedEventCount} published
        {/if}
    </div>

    {#if relayList}
        <div class="collapse bg-base-200 my-4">
            <input type="checkbox" />
            <div class="collapse-title text-xl font-medium">
                WIll publish to {relayList.writeRelayUrls.length} relays
            </div>
            <div class="collapse-content flex flex-col join join-vertical">
                <textarea bind:value={relayListString} class="join-item resize-none textarea textarea-bordered h-64"></textarea>
                <button on:click={updateRelayList} class="join-item btn btn-neutral">Update</button>
            </div>
        </div>
    {/if}

    {#if publishedEvents.size > 0 && !webln && satsPerTweet && satsPerTweet > 0}
        <div class="alert alert-info my-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-white shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>
                You don't have a Web LN available; you can zap {nicelyFormattedSatNumber(satsPerTweet * includedEventCount)} sats to @pablof7z if you'd like.
            </span>
        </div>
    {/if}
</div>

<style lang="postcss">
    :global(.event-card) {
        @apply card !bg-white !shadow;
    }

    :global(.event-card img) {
        @apply max-h-96;
    }
</style>