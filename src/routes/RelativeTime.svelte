<script lang="ts">
    import { NDKEvent } from "@nostr-dev-kit/ndk";
    import Time from "svelte-time";

    export let event: NDKEvent | undefined = undefined;

    /**
     * Timestamp to display
     */
    export let timestamp: number| undefined = event?.created_at * 1000;

    /**
     * Force-correct events/timestamps that are using milliseconds
     */
    if (timestamp > 1494887682700000) timestamp /= 1000;

    /**
     * Number of seconds to use relative time for.
     */
    export let timeAgoCutoff: number = 60*60*24;

    function useRelativeTime() {
        const now = Date.now();
        const diff = now - timestamp;

        return diff < 1000 * timeAgoCutoff;
    }
</script>

{#if !Number.isNaN(timestamp)}
    <Time
        relative={useRelativeTime()}
        live={true}
        {timestamp}
        class={$$props.class}
    />
{/if}