<script>
	import Hero from '$lib/components/Hero.svelte';
	import PrivacyNotice from '$lib/components/PrivacyNotice.svelte';

	let { data } = $props();
</script>

<Hero authMode={data.authMode} />
<PrivacyNotice authMode={data.authMode} />
