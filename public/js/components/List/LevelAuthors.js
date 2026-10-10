export default {
    props: {
        author: {
            type: [String, Array],
            required: true,
        },
        creators: {
            type: Array,
            required: true,
        },
        verifier: {
            type: String,
            default: '',
        },
        verifierUnknown: {
            type: Boolean,
            default: false,
        },
    },
    template: `
        <div class="level-authors">
            <template v-if="selfVerified">
                <div class="type-title-sm">Creator & Verifier</div>
                <p class="type-body">
                    <span>{{ formattedAuthor }}</span>
                </p>
            </template>
            <template v-else-if="creators.length === 0">
                <div class="type-title-sm">Creator</div>
                <p class="type-body">
                    <span>{{ formattedAuthor }}</span>
                </p>
                <div class="type-title-sm">Verifier</div>
                <p class="type-body">
                    <span>{{ verifierLabel }}</span>
                </p>
            </template>
            <template v-else>
                <div class="type-title-sm">Creators</div>
                <p class="type-body">
                    <template v-for="(creator, index) in creators" :key="\`creator-\${creator}\`">
                        <span>{{ creator }}</span><span v-if="index < creators.length - 1">, </span>
                    </template>
                </p>
                <div class="type-title-sm">Verifier</div>
                <p class="type-body">
                    <span>{{ verifierLabel }}</span>
                </p>
            </template>
            <div class="type-title-sm">Publisher</div>
            <p class="type-body">
                <span>{{ formattedAuthor }}</span>
            </p>
        </div>
    `,

    computed: {
        formattedAuthor() {
            return Array.isArray(this.author) ? this.author.join(', ') : this.author;
        },
        verifierLabel() {
            return this.verifierUnknown || !this.verifier ? 'Unknown' : this.verifier;
        },
        selfVerified() {
            return !this.verifierUnknown && !!this.verifier && this.formattedAuthor === this.verifier && this.creators.length === 0;
        },
    },
};
