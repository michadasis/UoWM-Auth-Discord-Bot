<script>
	import { env } from '$env/dynamic/public';

	let { authMode } = $props();
</script>

<section class="px-6 py-16 font-sans sm:py-32 lg:px-8">
	<div class="mx-auto max-w-2xl text-center">
		<h1 class="text-4xl font-bold tracking-tight text-skin-base sm:text-6xl">
			Πληροφορική <span class="text-[#5865F2]">UoWM</span> Discord
		</h1>
		<p class="mt-6 text-xl leading-8 text-skin-base">
			Ο διακομιστής Discord των φοιτητών και των διδασκόντων του Τμήματος Πληροφορικής του
			Πανεπιστημίου Δυτικής Μακεδονίας. Για πρόσβαση στα κανάλια, χρησιμοποιήστε την εντολή
			<code class="rounded bg-skin-accent px-1">/auth</code> στο κανάλι #verify
			{#if authMode === 'email'}
				και επιβεβαιώστε το ιδρυματικό σας email με έναν κωδικό μίας χρήσης.
			{:else}
				και συνδεθείτε με τον ιδρυματικό σας λογαριασμό στην επίσημη σελίδα του Πανεπιστημίου.
			{/if}
		</p>
		{#if env.PUBLIC_DISCORD_INVITE}
			<div class="mt-10">
				<a
					href={env.PUBLIC_DISCORD_INVITE}
					class="rounded-md bg-[#5865F2] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4752c4]"
					>Είσοδος στον διακομιστή</a
				>
			</div>
		{/if}
	</div>
</section>
