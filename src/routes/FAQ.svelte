<h2 class="text-2xl font-bold">FAQ</h2>

<div class="collapse bg-base-200 join-item collapse-open mb-4">
    <input type="checkbox" />
    <div class="collapse-title text-xl font-medium">
        What is this?
    </div>
    <div class="collapse-content">
        <p>
            EXIT.pub is a tool by @pablof7z that allows you to import your tweets
            into nostr.
        </p>

        <p>
            You can read the introductory note about this tool <a href="https://njump.me/nevent1qqsy6k5375ccgqz80jzv2g69ygx79k5x0d3srjkk6007h8c2lscy0ygrcvvny" class="link text-info">here</a>.
        </p>
    </div>
</div>

<div class="join join-vertical">
    <div class="collapse bg-base-200 join-item">
        <input type="checkbox" />
        <div class="collapse-title text-xl font-medium">
            I don't want to upload all my twitter content!
        </div>
        <div class="collapse-content">
            <p>Then don't! You can choose which individual tweets you bring to Nostr, or use the filtering tool to only bring tweets that contain a specific keyword.</p>

            <p>
                Anything and everything in Nostr requires your cryptographic signature, in Nostr, and by extension using EXIT.pub, you are <b>always in control</b>.
            </p>
        </div>
    </div>
    <div class="collapse bg-base-200 join-item">
        <input type="checkbox" />
        <div class="collapse-title text-xl font-medium">
            This tool keeps failing!
        </div>
        <div class="collapse-content">
            <p>
                Most likely, the relays you are choosing are not accepting your backdated events; most relays keep
                a limit on how far back they will accept events. I set up a specialized relay just for this usecase,
                you can use <code>wss://relay.exit.pub</code> as one of the relays in your list.
            </p>

            <p>
                If you have the capability, I would also advice setting up your own relay so you can always
                keep your own events accessible there as well.
            </p>
        </div>
    </div>

    <div class="collapse bg-base-200 join-item">
        <input type="checkbox" />
        <div class="collapse-title text-xl font-medium">
            What's the "Satellite CDN"
        </div>
        <div class="collapse-content">
            <p>
                If you tweeted including images, those images were uploaded to twitter's servers.
            </p>

            <p>
                You can choose to keep the Twitter URL pointing to those images in your nostr events,
                but if twitter decides to delete your account, those images might away.
            </p>

            <p>
                Satellite CDN is an <b>unaffiliated</b> Nostr client that allows you to very easily
                (and cheaply) buy storage to keep those images available for as long as you want.
            </p>

            <p>
                Again, EXIT.pub is not affiliated in any way to Satellite CDN, I just really like the
                developer behind it and the documentation provided to integrate with it is very comprehensive.
            </p>
        </div>
    </div>

    <div class="collapse bg-base-200 join-item">
        <input type="checkbox" />
        <div class="collapse-title text-xl font-medium">
            What happens if I import the same tweets twice?
        </div>
        <div class="collapse-content">
            <p>
                Nothing. Events will only be published once, so if you import the same tweet twice, the second
                tweet will be ignored by relays.
            </p>
        </div>
    </div>
</div>

<style lang="postcss">
    p:not(:last-child) {
        @apply mb-4;
    }

    .collapse:not(:last-child) {
        @apply border-b-2 border-black/10;
    }
</style>