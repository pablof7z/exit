import type { Tweet } from "./types";

export function nicelyFormattedSatNumber(amount: number) {
    // if the number is less than 1000, just return it
    if (amount < 1000) return amount;

    // if the number is less than 1 million, return it with a k, if the comma is not needed remove it
    if (amount < 1000000) return `${(amount / 1000).toFixed(0)}k`;

    // if the number is less than 1 billion, return it with an m
    if (amount < 1000000000) return `${(amount / 1000000).toFixed(1)}m`;

    return `${(amount / 100_000_000).toFixed(2)} btc`;
}

export function isRetweet(t: Tweet) {
    return t.full_text.startsWith('RT @');
}

export function isReply(t: Tweet, myScreenName: string): boolean {
    const replyingToSomeoneElse = t.in_reply_to_screen_name && t.in_reply_to_screen_name !== myScreenName;
    const contentStartsWithAt = t.full_text.match(/^[\.]?@[A-Za-z][A-Za-z0-9_]{0,14}/);

    return replyingToSomeoneElse || !!contentStartsWithAt;
}

export function isThread(tweet: Tweet, isReply: boolean, allTweets: Tweet[]): boolean {
    let currentTweet: Tweet | undefined = tweet;

    // Traverse up the reply chain.
    while (currentTweet) {
        // If it's the first tweet
        if (!currentTweet.in_reply_to_status_id) {
            // check if there is a tweet that replies to this one with the same user
            const isRepliedToByUser = !!allTweets.find((t) => t.in_reply_to_status_id_str === currentTweet!.id_str);

            // Check if this is a thread directed to a single person by being prefixed with @...
            const firstTweetIsReplyToSomeone = isReply;

            return isRepliedToByUser && !firstTweetIsReplyToSomeone;
        }

        currentTweet = allTweets.find(t => t.id_str === currentTweet!.in_reply_to_status_id);

        if (!currentTweet) return false;
    }

    return false;
}