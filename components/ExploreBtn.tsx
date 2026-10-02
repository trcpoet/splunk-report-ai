import Image from "next/image";

const ExploreBtn = () => {
    return (
        <a href="#reports" id="explore-btn" className="mt-7 mx-auto">
            Browse Reports
            <Image src="/icons/arrow-down.svg" alt="" width={25} height={24} />
        </a>
    )
}

export default ExploreBtn
