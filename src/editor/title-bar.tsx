import styles from "./title-bar.module.scss";

const TitleBar = () => {
	return (
		<div className={styles.titleBar}>
			<div className={styles.dragArea}>
				<span className={styles.appName}>Bitsplash</span>
				<div className={styles.commandSlot} />
			</div>
		</div>
	);
};

export default TitleBar;
