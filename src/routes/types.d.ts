export type EditInfoInitial = {
    editTweetIds: string[];
    editableUntil: string;
    editsRemaining: string;
    isEditEligible: boolean;
};

export type EditInfo = {
    initial: EditInfoInitial;
};

export type UserMention = {
    name: string;
    screen_name: string;
    indices: [number, number];
    id_str: string;
    id: string;
};

export type Url = {
    url: string;
    expanded_url: string;
    display_url: string;
    indices: [number, number];
};

export type Hashtag = {
    text: string;
};

export type Entities = {
    hashtags: Hashtag[];
    symbols: string[];
    user_mentions: UserMention[];
    urls: Url[];
};

export type MediaSize = {
    w: number;
    h: number;
    resize: string;
};

export type MediaEntity = {
    expanded_url: string;
    indices: [number, number];
    url: string;
    media_url: string;
    id_str: string;
    id: string;
    media_url_https: string;
    sizes: {
        large: MediaSize;
        medium: MediaSize;
        small: MediaSize;
        thumb: MediaSize;
    };
    type: string;
    display_url: string;
};

export type ExtendedEntities = {
    media: MediaEntity[];
};

export type Tweet = {
    edit_info: EditInfo;
    retweeted: boolean;
    source: string;
    entities: Entities;
    display_text_range: [number, number];
    favorite_count: string;
    in_reply_to_status_id_str?: string;
    id_str: string;
    timestamp?: number;
    in_reply_to_user_id: string;
    truncated: boolean;
    retweet_count: string;
    id: string;
    in_reply_to_status_id?: string;
    created_at: string;
    favorited: boolean;
    full_text: string;
    lang: string;
    in_reply_to_screen_name?: string;
    in_reply_to_user_id_str?: string;
    possibly_sensitive?: boolean;
    extended_entities?: ExtendedEntities;
};